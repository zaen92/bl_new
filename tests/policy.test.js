import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp,getFirestore,FieldValue} from '../functions/src/admin.js';
import {provisionProfile} from '../functions/src/profile.js';
import {saveOwnedPost,loadOwnedPost,deleteOwnedPost,listOwnedPosts} from '../functions/src/posts.js';
import {approveExport,saveBlogStyle,listStyles,selectStyle,deleteStyle} from '../functions/src/member-features.js';
import {DEFAULT_POLICY} from '../functions/src/service-policy.js';
import {textDocument} from '../src/text-document.js';
if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Emulator required');
const app=initializeApp({projectId:'demo-jaeinit'}),db=getFirestore(app),key='policy-test-HMAC-key-000000000000000000000';
let uid,index=0;
const identity=u=>({uid:u,email:u+'@example.test',emailVerified:true});
const payload=(id,expectedVersion=0,requestId='request-'+id)=>({id,requestId,expectedVersion,post:{title:'제목',data:{body:'본문 [사진1]',hashtags:['#글']},form:{ci:'원문'}}});
const user=async()=>(await db.doc(`users/${uid}`).get()).data();
const exp=id=>approveExport(db,uid,{requestId:id,digest:'a'.repeat(64),bytes:100});
beforeEach(async()=>{uid='policy-'+(++index);await db.doc('ops/service').set(DEFAULT_POLICY);await provisionProfile(db,identity(uid),key);});
after(async()=>{await db.doc('ops/service').delete();await db.terminate();await deleteApp(app);});
test('signup policy changes only future grants and preserves existing balance and ledger',async()=>{
 assert.equal((await user()).credits,5);await db.doc(`users/${uid}`).update({credits:2,freeCredits:2});
 await db.doc('creditLedger/signup_'+uid).update({delta:2,balanceAfter:2});const before=await db.doc('creditLedger/signup_'+uid).get();await db.doc('ops/service').set({...DEFAULT_POLICY,signupCredits:7});
 await provisionProfile(db,identity(uid),key);assert.equal((await user()).credits,2);assert.deepEqual((await db.doc('creditLedger/signup_'+uid).get()).data(),before.data());
 const fresh=uid+'-new';await provisionProfile(db,identity(fresh),key);assert.equal((await db.doc(`users/${fresh}`).get()).data().credits,7);
});
test('FREE exports allow five lifetime approvals, reject sixth and never debit AI credits',async()=>{
 for(let i=0;i<5;i++)assert.equal((await exp('export-'+i)).exportsUsed,i+1);
 await assert.rejects(exp('sixth'),{code:'resource-exhausted'});assert.equal((await user()).credits,5);
 await provisionProfile(db,identity(uid),key);await assert.rejects(exp('after-login'),{code:'resource-exhausted'});
});
test('24 duplicate export approvals count once and altered files cannot reuse an approval',async()=>{
 const result=await Promise.all(Array.from({length:24},()=>exp('same')));assert.equal(result.filter(r=>!r.duplicate).length,1);assert.equal((await user()).exportsUsed,1);
 await assert.rejects(approveExport(db,uid,{requestId:'same',digest:'b'.repeat(64),bytes:100}),{code:'already-exists'});
});
test('24 concurrent distinct export approvals cannot exceed five and re-registration cannot reset usage',async()=>{
 const results=await Promise.allSettled(Array.from({length:24},(_,i)=>exp('parallel-'+i)));assert.equal(results.filter(r=>r.status==='fulfilled').length,5);
 const again=uid+'-again';await provisionProfile(db,{...identity(again),email:identity(uid).email},key);
 await assert.rejects(approveExport(db,again,{requestId:'rejoin',digest:'a'.repeat(64),bytes:100}),{code:'resource-exhausted'});
});
test('FREE five posts, sixth denied, updates keep count and deletion restores one slot',async()=>{
 for(let i=0;i<5;i++)await saveOwnedPost(db,uid,payload(uid+'-'+i));
 await assert.rejects(saveOwnedPost(db,uid,payload(uid+'-sixth')),{code:'resource-exhausted'});
 await saveOwnedPost(db,uid,payload(uid+'-0',1,'edit'));assert.equal((await user()).savedPostCount,5);
 await deleteOwnedPost(db,uid,{id:uid+'-0',requestId:'delete'});await deleteOwnedPost(db,uid,{id:uid+'-0',requestId:'delete'});
 await saveOwnedPost(db,uid,payload(uid+'-sixth'));assert.equal((await user()).savedPostCount,5);assert.equal((await user()).credits,5);
});
test('24 concurrent saves cannot exceed FREE five and duplicate saves keep one slot',async()=>{
 const results=await Promise.allSettled(Array.from({length:24},(_,i)=>saveOwnedPost(db,uid,payload(uid+'-'+i))));assert.equal(results.filter(r=>r.status==='fulfilled').length,5);assert.equal((await user()).savedPostCount,5);
 const docs=await db.collection('posts').where('uid','==',uid).get();const p=docs.docs[0];const original=p.data();
 const result=await saveOwnedPost(db,uid,payload(p.id,0,original.lastRequestId));assert.equal(result.version,1);assert.equal((await user()).savedPostCount,5);
});
test('over-limit legacy posts and image records survive migration; only new saves are blocked',async()=>{
 await db.doc(`users/${uid}`).update({savedPostCount:FieldValue.delete()});
 for(let i=0;i<7;i++){const p=payload(uid+'-'+i);await db.doc('posts/'+p.id).set({...p.post,uid,version:1,updatedAt:new Date()});}
 await db.doc(`posts/${uid}-0/photoChunks/old`).set({value:'legacy-image-preserve'});
 await provisionProfile(db,identity(uid),key);assert.equal((await user()).savedPostCount,7);
 await assert.rejects(saveOwnedPost(db,uid,payload(uid+'-new')),{code:'resource-exhausted'});
 await saveOwnedPost(db,uid,payload(uid+'-0',1,'edit'));assert.equal((await user()).savedPostCount,7);
 assert.equal((await db.doc(`posts/${uid}-0/photoChunks/old`).get()).data().value,'legacy-image-preserve');assert.deepEqual((await loadOwnedPost(db,uid,uid+'-0')).imgs,[]);
});
test('PRO fixture has no product post/export cap, paginates, and stays PRO at zero credits',async()=>{
 await db.doc(`users/${uid}`).update({tier:'PRO',credits:0,freeCredits:0,paidCredits:0});
 for(let i=0;i<7;i++){await saveOwnedPost(db,uid,payload(uid+'-'+i));await exp('pro-'+i);}
 const first=await listOwnedPosts(db,uid,{pageSize:3}),second=await listOwnedPosts(db,uid,{cursor:first.nextCursor,pageSize:3});
 assert.equal(first.posts.length,3);assert.equal(second.posts.length,3);assert.equal(new Set([...first.posts,...second.posts].map(p=>p.id)).size,6);assert.equal((await user()).tier,'PRO');assert.equal((await user()).credits,0);
});
test('FREE single style is editable; PRO fixture selects multiple styles and legacy style is preserved',async()=>{
 await saveBlogStyle(db,uid,{id:'default',style:{greeting:'내 인사'}});await saveBlogStyle(db,uid,{id:'default',style:{greeting:'수정 인사'}});
 await assert.rejects(saveBlogStyle(db,uid,{id:'second',style:{greeting:'다른 인사'}}),{code:'resource-exhausted'});
 await db.doc(`users/${uid}`).update({tier:'PRO'});await saveBlogStyle(db,uid,{id:'second',style:{greeting:'다른 인사'}});await selectStyle(db,uid,{id:'default'});
 assert.equal((await user()).blogStyle.greeting,'수정 인사');assert.equal((await listStyles(db,uid)).styles.length,2);await deleteStyle(db,uid,{id:'second'});assert.equal((await listStyles(db,uid)).styles.length,1);
});
test('legacy single blogStyle migrates without loss, configurable limits and other member cursors are enforced',async()=>{
 await db.doc(`users/${uid}`).update({blogStyle:{greeting:'기존 스타일'}});await db.doc('ops/service').set({...DEFAULT_POLICY,freeStyleLimit:2,freePostLimit:1,freeExportLimit:1});
 await saveBlogStyle(db,uid,{id:'new',style:{greeting:'새 스타일'}});const styles=(await listStyles(db,uid)).styles;assert.equal(styles.find(s=>s.id==='default').greeting,'기존 스타일');
 await saveOwnedPost(db,uid,payload(uid+'-first'));await assert.rejects(saveOwnedPost(db,uid,payload(uid+'-second')),{code:'resource-exhausted'});await exp('one');await assert.rejects(exp('two'),{code:'resource-exhausted'});
 await assert.rejects(listOwnedPosts(db,'other',{cursor:uid+'-first'}),{code:'permission-denied'});
});
test('JSON allowlist strips old photos, privileges, counters, tokens and restores only text and placement',()=>{
 const image='data:image/png;base64,YQ==';const dirty={...payload('import').post,imgs:[image],tier:'PRO',credits:999,token:'secret',exportsUsed:0,legacyRaw:image,style:{greeting:'인사',apiKey:'secret'}};
 const clean=textDocument(dirty),json=JSON.stringify(clean);for(const word of ['data:image','secret','PRO','credits','exportsUsed','legacyRaw'])assert.ok(!json.includes(word));assert.deepEqual(clean.photoPositions,[1]);assert.equal(clean.style.greeting,'인사');assert.deepEqual(clean.imgs,[]);
 for(const bad of [{data:{body:42}},{data:{body:'x',hashtags:'bad'}},{form:{ci:'data:image/png;base64,YQ=='}}])assert.throws(()=>textDocument(bad));
});
