import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp,getFirestore,getAuth,Timestamp} from '../functions/src/admin.js';
import {provisionProfile,signupIdentity} from '../functions/src/profile.js';
import {saveOwnedPost,loadOwnedPost} from '../functions/src/posts.js';
if(!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)throw new Error('Run npm test with emulators.');
const app=initializeApp({projectId:'demo-jaeinit'});
const db=getFirestore(app),auth=getAuth(app);
after(async()=>{await db.terminate();await deleteApp(app);});
const key='emulator-test-only-signup-hmac-key-000000000000';
const identity=uid=>({uid,email:`${uid}@example.test`,emailVerified:true,displayName:'테스트'});
const post={title:'서울 카페',type:'카페',volume:'normal',date:'오늘',data:{title_1:'서울 카페',body:'사진 포함 본문 [사진1]',hashtags:['#서울']},form:{ti:'제목',mi:'메모',ci:'직접 쓴 내용',ii:'주소'},imgs:['data:image/png;base64,'+'YQ=='.repeat(1)]};
test('concurrent/repeated initializations grant exactly 2 once and one ledger entry',async()=>{
 const user=identity('concurrent');
 const results=await Promise.all(Array.from({length:24},()=>provisionProfile(db,user,key)));
 assert.equal(results.filter(r=>r.created).length,1);
 assert.equal((await db.doc('users/concurrent').get()).data().credits,2);
 const ledger=await db.collection('creditLedger').where('uid','==',user.uid).get();
 assert.equal(ledger.size,1);assert.equal(ledger.docs[0].data().delta,2);
 assert.ok(ledger.docs[0].data().createdAt instanceof Timestamp);
 assert.ok((await db.doc(`users/${user.uid ?? user.localId}`).get()).data().createdAt instanceof Timestamp);
 assert.equal(ledger.docs[0].data().balanceAfter,2);
 const profile=(await db.doc('users/concurrent').get()).data();
 const claim=(await db.doc(`signupClaims/${signupIdentity(user.email,key)}`).get()).data();
 assert.ok(profile.createdAt.isEqual(ledger.docs[0].data().createdAt));
 assert.ok(profile.createdAt.isEqual(claim.createdAt));
 await provisionProfile(db,user,key);
 assert.equal((await db.doc('users/concurrent').get()).data().credits,2);
});
test('deletion/re-registration with same verified email, case/space variants cannot mint credits',async()=>{
 await provisionProfile(db,identity('original'),key);
 await db.doc('users/original').delete();
 await provisionProfile(db,identity('original'),key);
 assert.equal((await db.doc('users/original').get()).data().credits,0);
 const sameEmail={...identity('rejoined'),email:' ORIGINAL@EXAMPLE.TEST '};
 await provisionProfile(db,sameEmail,key);
 assert.equal((await db.doc('users/rejoined').get()).data().credits,0);
 assert.equal((await db.collection('creditLedger').where('uid','==','rejoined').get()).size,0);
});
test('24 distinct UIDs concurrently sharing verified email receive 2 credits total',async()=>{
 const users=Array.from({length:24},(_,i)=>`race-${i}`).map(uid=>({...identity(uid),email:'shared@example.test'}));
 const results=await Promise.all(users.map(user=>provisionProfile(db,user,key)));
 assert.equal(results.reduce((sum,r)=>sum+r.credits,0),2);
});
test('unverified and disabled identities cannot get profiles',async()=>{
 await assert.rejects(provisionProfile(db,{...identity('unverified'),emailVerified:false},key));
 await assert.rejects(provisionProfile(db,{...identity('disabled'),disabled:true},key));
 assert.equal((await db.doc('users/unverified').get()).exists,false);
});
test('cloud post preserves source, result and chunked photos; idempotency, CAS and ownership enforced',async()=>{
 const payload={id:'post-test',requestId:'request-one',expectedVersion:0,post};
 assert.deepEqual(await saveOwnedPost(db,'writer',payload),{id:'post-test',version:1});
 assert.deepEqual(await saveOwnedPost(db,'writer',payload),{id:'post-test',version:1});
 const loaded=await loadOwnedPost(db,'writer','post-test');
 assert.ok(loaded.createdAt instanceof Timestamp);assert.ok(loaded.updatedAt instanceof Timestamp);
 assert.deepEqual(loaded.imgs,post.imgs);assert.deepEqual(loaded.form,post.form);assert.equal(loaded.data.body,post.data.body);
 await assert.rejects(loadOwnedPost(db,'intruder','post-test'),{code:'permission-denied'});
 await assert.rejects(saveOwnedPost(db,'intruder',payload),{code:'permission-denied'});
 await assert.rejects(saveOwnedPost(db,'writer',{...payload,requestId:'request-two'}),{code:'aborted'});
 await saveOwnedPost(db,'writer',{...payload,requestId:'request-three',expectedVersion:1,post:{...post,imgs:[]}});
 assert.equal((await db.collection('posts/post-test/photoChunks').get()).size,0);
});
test('oversized or unsafe photos rejected without partial cloud write',async()=>{
 for(const imgs of [['javascript:alert(1)'],['data:image/svg+xml;base64,YQ=='],['data:image/jpeg;base64,'+'a'.repeat(4200000)]]){
  await assert.rejects(saveOwnedPost(db,'writer',{id:'invalid',requestId:'invalid',expectedVersion:0,post:{...post,imgs}}),{code:'invalid-argument'});
 }
 assert.equal((await db.doc('posts/invalid').get()).exists,false);
});
async function signup(email){
 const res=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'test-password-123',returnSecureToken:true})});
 const data=await res.json();assert.ok(data.idToken,JSON.stringify(data));return data;
}
async function callable(name,token,data={}){
 const response=await fetch(`http://127.0.0.1:5001/demo-jaeinit/asia-northeast3/${name}`,{method:'POST',headers:{'content-type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({data})});
 return response.json();
}
test('actual callable: unauthenticated/unverified rejected; verified provisioning, rejoin and STEP2 gates',async()=>{
 assert.equal((await callable('ensureProfile')).error.status,'UNAUTHENTICATED');
 assert.equal((await callable('requestGeneration')).error.status,'UNAUTHENTICATED');
 const email='callable@example.test';const user=await signup(email);
 assert.equal((await callable('ensureProfile',user.idToken)).error.status,'FAILED_PRECONDITION');
 await auth.updateUser(user.localId,{emailVerified:true});
 const initial=await Promise.all(Array.from({length:24},()=>callable('ensureProfile',user.idToken,{credits:999})));
 assert.equal(initial.filter(r=>r.result?.created).length,1);
 for(const result of initial)assert.equal(result.result?.credits,2,JSON.stringify(result));
 const ledger=await db.collection('creditLedger').where('uid','==',user.localId).get();
 assert.equal(ledger.size,1);assert.equal(ledger.docs[0].data().delta,2);
 assert.ok(ledger.docs[0].data().createdAt instanceof Timestamp);
 assert.ok((await db.doc(`users/${user.uid ?? user.localId}`).get()).data().createdAt instanceof Timestamp);
 assert.equal(ledger.docs[0].data().balanceAfter,2);
 for(let attempt=0;attempt<3;attempt++){
  const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'test-password-123',returnSecureToken:true})});
  const login=await response.json();assert.ok(login.idToken);
  const repeated=await callable('ensureProfile',login.idToken);
  assert.equal(repeated.result.created,false);assert.equal(repeated.result.credits,2);
 }
 assert.equal((await db.collection('creditLedger').where('uid','==',user.localId).get()).size,1);
 assert.equal((await callable('requestGeneration',user.idToken)).error.status,'INVALID_ARGUMENT');
 for(const name of ['createOrder','confirmPayment'])assert.equal((await callable(name,user.idToken)).error.status,'UNIMPLEMENTED');
 const save=await callable('savePost',user.idToken,{id:'via-callable',requestId:'first',expectedVersion:0,post});
 assert.equal(save.result.version,1);
 assert.deepEqual((await callable('getPost',user.idToken,{id:'via-callable'})).result.imgs,post.imgs);
 assert.equal((await db.doc(`users/${user.localId}`).get()).data().credits,2);
 await auth.deleteUser(user.localId);await db.doc(`users/${user.localId}`).delete();
 const rejoined=await signup(email);await auth.updateUser(rejoined.localId,{emailVerified:true});
 assert.equal((await callable('ensureProfile',rejoined.idToken)).result.credits,0);
 await auth.updateUser(rejoined.localId,{disabled:true});
 assert.equal((await callable('ensureProfile',rejoined.idToken)).error.status,'UNAUTHENTICATED');
});
