import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp,getFirestore,getStorage,Timestamp} from '../functions/src/admin.js';
import {provisionProfile} from '../functions/src/profile.js';
import {reserveGeneration,runGeneration,recoverExpired,saveBlogStyle} from '../functions/src/generations.js';
import {DEFAULT_AI_CONFIG,maxCost} from '../functions/src/ai-config.js';
import {mockProvider,ProviderError} from '../functions/src/ai-provider.js';
import {uploadPhotos,loadPhotos,deletePhotoGroup,cleanupPhotos,deleteUserPhotos} from '../functions/src/photos.js';
import {saveStoragePost,loadOwnedPost} from '../functions/src/posts.js';
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_STORAGE_EMULATOR_HOST)throw new Error('Run with demo Firebase emulators.');
const app=initializeApp({projectId:'demo-jaeinit'}),db=getFirestore(app),bucket=getStorage(app).bucket('demo-jaeinit.appspot.com');
const secret='step2-test-only-hmac-0000000000000000000000';
let index=0,now,uid;
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const input=requestId=>({requestId,title:'서울 카페',memo:'메모',content:'직접 경험',placeInfo:'서울',type:'카페',volume:'normal'});
async function member(name=uid,credits=2){
 await provisionProfile(db,{uid:name,email:name+'@example.test',emailVerified:true},secret);
 if(credits!==2)await db.doc(`users/${name}`).update({credits,freeCredits:Math.min(2,credits),paidCredits:Math.max(0,credits-2)});
 return name;
}
const reserve=(key,who=uid,extra={})=>reserveGeneration(db,who,{...input(key),...extra},{now,enqueue:false});
const run=(id,provider=mockProvider(),extra={})=>runGeneration(db,id,{provider,now:()=>now,loadPhotos:(u,g)=>loadPhotos(db,bucket,u,g),...extra});
const user=async(who=uid)=>(await db.doc(`users/${who}`).get()).data();
const record=async id=>(await db.doc(`generations/${id}`).get()).data();
beforeEach(async()=>{index++;uid='step2-'+index;now=Date.UTC(2027,0,index);await db.doc('ops/ai').set(DEFAULT_AI_CONFIG);await member();});
after(async()=>{await db.terminate();await deleteApp(app);});

test('free signup 2 -> first 1 -> second 0; third is blocked before any AI invocation',async()=>{
 assert.equal((await user()).credits,2);let calls=0;
 const provider=async args=>{calls++;return mockProvider()(args);};
 for(const [key,left] of [['first',1],['second',0]]){const g=await reserve(key);await run(g.generationId,provider);assert.equal((await user()).credits,left);assert.equal((await record(g.generationId)).status,'succeeded');}
 await assert.rejects(reserve('third'),{code:'resource-exhausted'});assert.equal(calls,2);
});
test('free credits are reserved first and successful debit keeps remaining paid balance',async()=>{
 await db.doc(`users/${uid}`).update({credits:3,freeCredits:1,paidCredits:2});
 const g=await reserve('free-first');assert.equal((await user()).heldFree,1);assert.equal((await user()).paidCredits,2);
 await run(g.generationId);assert.equal((await user()).credits,2);assert.equal((await user()).heldFree,0);
});
test('API failure refunds the exact paid credit type and records known partial cost',async()=>{
 await db.doc(`users/${uid}`).update({credits:1,freeCredits:0,paidCredits:1});
 const g=await reserve('paid-error');
 await run(g.generationId,async()=>{throw new ProviderError('provider_http_500',{inputTokens:20,outputTokens:3,searches:0});});
 const u=await user();assert.equal(u.credits,1);assert.equal(u.paidCredits,1);assert.equal(u.freeCredits,0);assert.equal(u.heldPaid,0);
 const cost=(await db.doc(`generationCosts/${g.generationId}`).get()).data();assert.equal(cost.chargedMicros,105);assert.equal(cost.estimated,false);
 const interrupted=await reserve('partial-error');await run(interrupted.generationId,async()=>{throw new ProviderError('incomplete_response',{inputTokens:20,outputTokens:0,searches:0,uncertain:true});});
 const uncertain=(await db.doc(`generationCosts/${interrupted.generationId}`).get()).data();assert.equal(uncertain.estimated,true);assert.equal(uncertain.chargedMicros,maxCost(DEFAULT_AI_CONFIG));assert.equal((await user()).paidCredits,1);
});
test('24 duplicate requests and worker deliveries invoke AI once and reserve/commit once',async()=>{
 const accepted=await Promise.all(Array.from({length:24},()=>reserve('same')));
 assert.equal(new Set(accepted.map(g=>g.generationId)).size,1);assert.equal(accepted.filter(g=>!g.duplicate).length,1);
 let calls=0;const provider=async args=>{calls++;return mockProvider()(args);};
 await Promise.all(Array.from({length:24},()=>run(accepted[0].generationId,provider)));
 assert.equal(calls,1);assert.equal((await user()).credits,1);
 const ledger=await db.collection('creditLedger').where('referenceId','==',accepted[0].generationId).get();assert.equal(ledger.size,2);
 await assert.rejects(reserve('same',uid,{content:'다른 입력'}),{code:'already-exists'});
});
test('24 different concurrent requests across devices cannot overspend two credits',async()=>{
 const results=await Promise.allSettled(Array.from({length:24},(_,i)=>reserve('device-'+i)));
 const accepted=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
 assert.equal(accepted.length,2);assert.equal((await user()).credits,0);assert.equal((await user()).heldFree,2);
 for(const g of accepted)await run(g.generationId);
 assert.equal((await user()).credits,0);assert.equal((await user()).heldFree,0);
});
test('timeout aborts work and refunds without treating incomplete output as a success',async()=>{
 await db.doc('ops/ai').set({...DEFAULT_AI_CONFIG,timeoutMs:1000});const g=await reserve('timeout');
 await run(g.generationId,async({signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new ProviderError('timeout')),{once:true})));
 assert.equal((await record(g.generationId)).status,'failed_refunded');assert.equal((await user()).credits,2);
});
test('server crash reservation recovery is idempotent across 24 recovery workers',async()=>{
 const g=await reserve('crash');await db.doc(`generations/${g.generationId}`).update({status:'running',providerAttempted:true,attempt:'crashed'});
 const results=await Promise.all(Array.from({length:24},()=>recoverExpired(db,{now:now+600000})));
 assert.equal(results.reduce((sum,r)=>sum+r.recovered,0),1);assert.equal((await user()).credits,2);
 const refunds=await db.collection('creditLedger').where('referenceId','==',g.generationId).where('reason','==','generation_refund').get();assert.equal(refunds.size,1);
 assert.equal((await db.doc(`generationCosts/${g.generationId}`).get()).data().estimated,true);
});
test('late completion after recovery cannot charge again or resurrect a failed generation',async()=>{
 const g=await reserve('late');let release,started;
 const ready=new Promise(r=>started=r);
 const running=run(g.generationId,async args=>{started();await new Promise(r=>release=r);return mockProvider()(args);});
 await Promise.race([ready,running.then(async()=>{throw new Error('Worker ended before provider start: '+JSON.stringify(await record(g.generationId)));})]);await recoverExpired(db,{now:now+600000});release();await running;
 assert.equal((await user()).credits,2);assert.equal((await record(g.generationId)).status,'failed_refunded');
 assert.equal((await db.doc(`creditLedger/${g.generationId}_commit`).get()).exists,false);
});
test('three-per-minute limit and configurable daily/concurrency limits reject before AI',async()=>{
 await member(uid,8);await db.doc('ops/ai').set({...DEFAULT_AI_CONFIG,perMinute:3,perDay:4});
 for(let i=0;i<3;i++){const g=await reserve('minute-'+i);await run(g.generationId);}
 await assert.rejects(reserve('minute-limit'),{code:'resource-exhausted'});
 now+=60001;const fourth=await reserve('fourth');await run(fourth.generationId);
 now+=60001;await assert.rejects(reserve('day-limit'),{code:'resource-exhausted'});
});
test('daily global budget reservation and operator pause prevent new and queued AI work',async()=>{
 await member(uid,5);await db.doc('ops/ai').set({...DEFAULT_AI_CONFIG,dailyBudgetMicros:maxCost(DEFAULT_AI_CONFIG)});
 const g=await reserve('budget');const other=await member(uid+'-other');
 await assert.rejects(reserve('budget-block',other),{code:'resource-exhausted'});
 await db.doc('ops/ai').set({...DEFAULT_AI_CONFIG,enabled:false});let called=false;
 await run(g.generationId,async()=>{called=true;});assert.equal(called,false);assert.equal((await user()).credits,5);
 await assert.rejects(reserve('paused'),{code:'unavailable'});
});
test('profile style is loaded on server and request style spoofing cannot override it',async()=>{
 await saveBlogStyle(db,uid,{blogName:'내 블로그',greeting:'서버 인사',closing:'서버 끝',tone:'emotional',emoji:false,instructions:'담백하게'});
 const g=await reserve('style',uid,{style:{greeting:'클라이언트 위조'}});await run(g.generationId);
 const v=await record(g.generationId);assert.ok(v.result.body.includes('서버 인사'));assert.ok(v.result.body.includes('서버 끝'));assert.ok(!v.result.body.includes('클라이언트 위조'));
});
test('multiple photos stay private, preserve ordered placement and survive saved-post reopen',async()=>{
 const uploaded=await uploadPhotos(db,bucket,uid,{requestId:'photos',photos:[png,png]},{now});
 const g=await reserve('photo-generation',uid,{photoGroupId:uploaded.photoGroupId});await run(g.generationId);
 assert.ok((await record(g.generationId)).result.body.includes('[사진2]'));
 const data=(await record(g.generationId)).result;
 await saveStoragePost(db,uid,{id:'post-'+uid,requestId:'save',expectedVersion:0,generationId:g.generationId,post:{title:data.title_1,data,imgs:[]}});
 const post=await loadOwnedPost(db,uid,'post-'+uid);assert.equal(post.photoGroupId,uploaded.photoGroupId);
 const photos=await loadPhotos(db,bucket,uid,post.photoGroupId);assert.equal(photos.length,2);assert.equal(photos[0].buffer.toString('base64'),png.split(',')[1]);
 const group=(await db.doc(`photoGroups/${post.photoGroupId}`).get()).data();assert.equal(group.savedRefs,1);
 for(const object of group.objects){const [metadata]=await bucket.file(object.path).getMetadata();assert.ok(!metadata.metadata?.firebaseStorageDownloadTokens);}
 await saveStoragePost(db,uid,{id:'post-'+uid,requestId:'remove-photos',expectedVersion:1,post:{title:'사진 없는 수정',data,imgs:[]}});
 const detached=(await db.doc(`photoGroups/${uploaded.photoGroupId}`).get()).data();assert.equal(detached.savedRefs,0);assert.ok(detached.expiresAt instanceof Timestamp);
});
test('quota reservation rejects excess count/size and a second upload over user quota',async()=>{
 await assert.rejects(uploadPhotos(db,bucket,uid,{requestId:'too-many',photos:Array(11).fill(png)}),{code:'invalid-argument'});
 await assert.rejects(uploadPhotos(db,bucket,uid,{requestId:'bad',photos:['data:image/svg+xml;base64,PHN2Zz4=']}),{code:'invalid-argument'});
 const oversized=Buffer.alloc(DEFAULT_AI_CONFIG.maxPhotoBytes+1);Buffer.from(png.split(',')[1],'base64').copy(oversized);
 await assert.rejects(uploadPhotos(db,bucket,uid,{requestId:'oversized',photos:['data:image/png;base64,'+oversized.toString('base64')]}),{code:'invalid-argument'});
 const medium=oversized.subarray(0,1800000).toString('base64');
 await assert.rejects(uploadPhotos(db,bucket,uid,{requestId:'total-limit',photos:Array(4).fill('data:image/png;base64,'+medium)}),{code:'invalid-argument'});
 const bytes=Buffer.from(png.split(',')[1],'base64').length;
 await db.doc('ops/ai').set({...DEFAULT_AI_CONFIG,storageQuotaBytes:bytes});
 await uploadPhotos(db,bucket,uid,{requestId:'one',photos:[png]},{now});
 await assert.rejects(uploadPhotos(db,bucket,uid,{requestId:'two',photos:[png]},{now}),{code:'resource-exhausted'});
 assert.equal((await user()).storageBytes,bytes);assert.equal((await user()).storageReservedBytes,0);
});
test('unsaved photos expire after 90 days while saved references remain retained',async()=>{
 const first=await uploadPhotos(db,bucket,uid,{requestId:'expire',photos:[png]},{now});
 const saved=await uploadPhotos(db,bucket,uid,{requestId:'saved',photos:[png]},{now});
 const g=await reserve('save-retain',uid,{photoGroupId:saved.photoGroupId});await run(g.generationId);
 await saveStoragePost(db,uid,{id:'retained-'+uid,requestId:'retain',expectedVersion:0,generationId:g.generationId,post:{title:'보관',data:(await record(g.generationId)).result}});
 await cleanupPhotos(db,bucket,{now:now+91*86400000});
 const deleted=(await db.doc(`photoGroups/${first.photoGroupId}`).get()).data();assert.equal(deleted.status,'deleted');assert.equal(deleted.expiresAt,undefined);assert.equal(deleted.uploadDeadline,undefined);
 assert.equal((await loadPhotos(db,bucket,uid,saved.photoGroupId)).length,1);
 const quota=(await user()).storageBytes;
 await Promise.all(Array.from({length:8},()=>deletePhotoGroup(db,bucket,first.photoGroupId,{force:true})));
 assert.equal((await user()).storageBytes,quota);
});
test('other members cannot attach or load private photos/posts and deletion removes all owned files',async()=>{
 const uploaded=await uploadPhotos(db,bucket,uid,{requestId:'private',photos:[png]},{now});const other=await member(uid+'-intruder');
 await assert.rejects(loadPhotos(db,bucket,other,uploaded.photoGroupId),{code:'permission-denied'});
 await assert.rejects(reserve('steal',other,{photoGroupId:uploaded.photoGroupId}),{code:'permission-denied'});
 await deleteUserPhotos(db,bucket,uid);
 assert.equal((await bucket.getFiles({prefix:`users/${uid}/`}))[0].length,0);
 assert.equal((await user()).storageBytes,0);
 await assert.rejects(reserve('deleted'),{code:'failed-precondition'});
});
test('public generation excludes operator cost fields and native timestamps commit atomically',async()=>{
 const g=await reserve('audit');await run(g.generationId);
 const v=await record(g.generationId);
 for(const key of ['config','budgetReservedMicros','day','fingerprint','usage','chargedMicros'])assert.equal(v[key],undefined);
 const cost=(await db.doc(`generationCosts/${g.generationId}`).get()).data();assert.equal(cost.provider,'mock');assert.equal(cost.providerCalls,1);assert.ok(cost.chargedMicros>0);
 const u=await user(),commit=(await db.doc(`creditLedger/${g.generationId}_commit`).get()).data();
 assert.ok(u.updatedAt instanceof Timestamp);assert.ok(commit.createdAt.isEqual(v.completedAt));
});
