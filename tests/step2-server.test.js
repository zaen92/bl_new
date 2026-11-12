import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp,getFirestore,Timestamp} from '../functions/src/admin.js';
import {provisionProfile} from '../functions/src/profile.js';
import {reserveGeneration,runGeneration,recoverExpired,saveBlogStyle} from '../functions/src/generations.js';
import {DEFAULT_AI_CONFIG,maxCost} from '../functions/src/ai-config.js';
import {mockProvider,ProviderError} from '../functions/src/ai-provider.js';
import {decodePhotos} from '../functions/src/photos.js';
import {saveOwnedPost,loadOwnedPost} from '../functions/src/posts.js';
if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Run with demo Firebase emulators.');
const app=initializeApp({projectId:'demo-jaeinit'}),db=getFirestore(app);
const secret='step2-test-only-hmac-0000000000000000000000';
let index=0,now,uid;
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const input=requestId=>({requestId,title:'서울 카페',memo:'메모',content:'직접 경험',placeInfo:'서울',type:'카페',volume:'normal'});
async function member(name=uid,credits=5){
 await provisionProfile(db,{uid:name,email:name+'@example.test',emailVerified:true},secret);
 if(credits!==5)await db.doc(`users/${name}`).update({credits,freeCredits:Math.min(5,credits),paidCredits:Math.max(0,credits-5)});
 return name;
}
const reserve=(key,who=uid,extra={})=>reserveGeneration(db,who,{...input(key),...extra},{now,enqueue:false});
const run=(id,provider=mockProvider(),extra={})=>runGeneration(db,id,{provider,now:()=>now,...extra});
const user=async(who=uid)=>(await db.doc(`users/${who}`).get()).data();
const record=async id=>(await db.doc(`generations/${id}`).get()).data();
beforeEach(async()=>{index++;uid='step2-'+index;now=Date.UTC(2027,0,index);await db.doc('ops/ai').set(DEFAULT_AI_CONFIG);await member();});
after(async()=>{await db.terminate();await deleteApp(app);});

test('free signup 5 -> five successes -> zero; sixth blocked before AI',async()=>{
 assert.equal((await user()).credits,5);assert.equal((await user()).tier,'FREE');let calls=0;
 const provider=async args=>{calls++;return mockProvider()(args);};
 for(let left=4;left>=0;left--){const g=await reserve('free-'+left);await run(g.generationId,provider);assert.equal((await user()).credits,left);assert.equal((await record(g.generationId)).status,'succeeded');now+=60001;}
 await assert.rejects(reserve('sixth'),{code:'resource-exhausted'});assert.equal(calls,5);
});
test('free credits are reserved first and successful debit keeps remaining paid balance',async()=>{
 await db.doc(`users/${uid}`).update({credits:3,freeCredits:1,paidCredits:2});
 const g=await reserve('free-first');assert.equal((await user()).heldFree,1);assert.equal((await user()).paidCredits,2);
 await run(g.generationId);assert.equal((await user()).credits,5);assert.equal((await user()).heldFree,0);
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
 assert.equal(calls,1);assert.equal((await user()).credits,4);
 const ledger=await db.collection('creditLedger').where('referenceId','==',accepted[0].generationId).get();assert.equal(ledger.size,2);
 await assert.rejects(reserve('same',uid,{content:'다른 입력'}),{code:'already-exists'});
});
test('24 devices cannot overspend a preserved legacy two-credit balance',async()=>{
 await member(uid,2);
 const results=await Promise.allSettled(Array.from({length:24},(_,i)=>reserve('device-'+i)));
 const accepted=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
 assert.equal(accepted.length,2);assert.equal((await user()).credits,0);assert.equal((await user()).heldFree,2);
 for(const g of accepted)await run(g.generationId);
 assert.equal((await user()).credits,0);assert.equal((await user()).heldFree,0);
});
test('timeout aborts work and refunds without treating incomplete output as a success',async()=>{
 await db.doc('ops/ai').set({...DEFAULT_AI_CONFIG,timeoutMs:1000});const g=await reserve('timeout');
 await run(g.generationId,async({signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new ProviderError('timeout')),{once:true})));
 assert.equal((await record(g.generationId)).status,'failed_refunded');assert.equal((await user()).credits,5);
});
test('server crash reservation recovery is idempotent across 24 recovery workers',async()=>{
 const g=await reserve('crash');await db.doc(`generations/${g.generationId}`).update({status:'running',providerAttempted:true,attempt:'crashed'});
 const results=await Promise.all(Array.from({length:24},()=>recoverExpired(db,{now:now+600000})));
 assert.equal(results.reduce((sum,r)=>sum+r.recovered,0),1);assert.equal((await user()).credits,5);
 const refunds=await db.collection('creditLedger').where('referenceId','==',g.generationId).where('reason','==','generation_refund').get();assert.equal(refunds.size,1);
 assert.equal((await db.doc(`generationCosts/${g.generationId}`).get()).data().estimated,true);
});
test('late completion after recovery cannot charge again or resurrect a failed generation',async()=>{
 const g=await reserve('late');let release,started;
 const ready=new Promise(r=>started=r);
 const running=run(g.generationId,async args=>{started();await new Promise(r=>release=r);return mockProvider()(args);});
 await Promise.race([ready,running.then(async()=>{const value=await record(g.generationId);throw new Error('Worker ended before provider start: '+JSON.stringify({status:value.status,phase:value.phase,errorCode:value.errorCode}));})]);await recoverExpired(db,{now:now+600000});release();await running;
 assert.equal((await user()).credits,5);assert.equal((await record(g.generationId)).status,'failed_refunded');
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
test('ephemeral photos reach AI and placement survives text save with no persisted image data or jobs',async()=>{
 const photos=decodePhotos([png,png],DEFAULT_AI_CONFIG).photos;
 const g=await reserve('photo-generation',uid,{photos:[png,png]});let seen;
 await run(g.generationId,async args=>{seen=args.photos;return mockProvider()(args);},{photos});
 assert.equal(seen.length,2);const value=await record(g.generationId);assert.ok(value.result.body.includes('[사진2]'));
 await saveOwnedPost(db,uid,{id:'post-'+uid,requestId:'save',expectedVersion:0,post:{title:'사진 글',data:value.result}});
 const post=await loadOwnedPost(db,uid,'post-'+uid);assert.deepEqual(post.imgs,[]);assert.deepEqual(post.photoPositions,[1,2]);
 for(const collection of ['users','generations','generationInternal','generationJobs','posts']){
  const docs=await db.collection(collection).get();assert.ok(!JSON.stringify(docs.docs.map(d=>d.data())).includes(png.split(',')[1]));
 }
 assert.equal((await db.collection('generationJobs').get()).size,0);assert.equal((await db.collection('photoGroups').where('uid','==',uid).get()).size,0);
});
test('ephemeral photo count, MIME, per-file and total limits reject before reservation',async()=>{
 for(const photos of [Array(11).fill(png),['data:image/svg+xml;base64,PHN2Zz4=']])await assert.rejects(reserve('invalid-photo',uid,{photos}),{code:'invalid-argument'});
 const large=Buffer.alloc(DEFAULT_AI_CONFIG.maxPhotoBytes+1);Buffer.from(png.split(',')[1],'base64').copy(large);
 await assert.rejects(reserve('large',uid,{photos:['data:image/png;base64,'+large.toString('base64')]}),{code:'invalid-argument'});
 await assert.rejects(reserve('total',uid,{photos:Array(4).fill('data:image/png;base64,'+large.subarray(0,1800000).toString('base64'))}),{code:'invalid-argument'});
 assert.equal((await user()).credits,5);
});
test('lost in-memory photo attachments fail safely and refund without an AI call',async()=>{
 const g=await reserve('lost-attachments',uid,{photos:[png]});let calls=0;
 await run(g.generationId,async()=>{calls++;});assert.equal(calls,0);
 assert.equal((await record(g.generationId)).status,'failed_refunded');assert.equal((await user()).credits,5);
});
test('account deletion marker blocks generation and recovery preserves the original credit type',async()=>{
 const g=await reserve('deleted-request');await db.doc(`deletedUsers/${uid}`).set({deletedAt:Timestamp.fromMillis(now)});
 await run(g.generationId);assert.equal((await user()).credits,5);
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
