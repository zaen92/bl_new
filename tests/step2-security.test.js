import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc} from 'firebase/firestore';
import {initializeApp,deleteApp,getFirestore,getAuth,getStorage} from '../functions/src/admin.js';
import {provisionProfile} from '../functions/src/profile.js';
import {uploadPhotos} from '../functions/src/photos.js';
if(!process.env.FIREBASE_STORAGE_EMULATOR_HOST)throw new Error('Use demo emulators');
const app=initializeApp({projectId:'demo-jaeinit'}),db=getFirestore(app),auth=getAuth(app),bucket=getStorage(app).bucket('demo-jaeinit.appspot.com');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
let env,alice,bob,object;
async function login(uid){
 const email=uid+'@example.test',password='test-password-123';
 await auth.createUser({uid,email,password,emailVerified:true});
 await provisionProfile(db,{uid,email,emailVerified:true},'storage-test-key-000000000000000000000000');
 const r=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
 const value=await r.json();assert.ok(value.idToken);return value.idToken;
}
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-jaeinit',firestore:{rules:await readFile('firestore.rules','utf8')}});
 alice=await login('storage-alice');bob=await login('storage-bob');
 const group=await uploadPhotos(db,bucket,'storage-alice',{requestId:'rule-test',photos:[png]});
 object=(await db.doc(`photoGroups/${group.photoGroupId}`).get()).data().objects[0];
});
after(async()=>{await env.cleanup();await db.terminate();await deleteApp(app);});
const url=()=>`http://127.0.0.1:9199/v0/b/demo-jaeinit.appspot.com/o/${encodeURIComponent(object.path)}?alt=media`;
test('private Storage allows verified owner but rejects anonymous and another member without tokens',async()=>{
 assert.equal((await fetch(url())).status,403);
 assert.equal((await fetch(url(),{headers:{Authorization:'Bearer '+bob}})).status,403);
 const owner=await fetch(url(),{headers:{Authorization:'Bearer '+alice}});assert.equal(owner.status,200);
 assert.deepEqual(Buffer.from(await owner.arrayBuffer()),Buffer.from(png.split(',')[1],'base64'));
 const [metadata]=await bucket.file(object.path).getMetadata();assert.ok(!metadata.metadata?.firebaseStorageDownloadTokens);
});
test('Storage rejects client overwrite, public token injection and deleted-account reads',async()=>{
 const upload=`http://127.0.0.1:9199/v0/b/demo-jaeinit.appspot.com/o?name=${encodeURIComponent(object.path)}`;
 const response=await fetch(upload,{method:'POST',headers:{Authorization:'Bearer '+alice,'content-type':'image/png','X-Goog-Upload-Protocol':'raw'},body:Buffer.from(png.split(',')[1],'base64')});
 assert.equal(response.status,403);
 const patch=await fetch(url().replace('?alt=media',''),{method:'PATCH',headers:{Authorization:'Bearer '+alice,'content-type':'application/json'},body:JSON.stringify({metadata:{firebaseStorageDownloadTokens:'forbidden'}})});
 assert.equal(patch.status,403);
 await db.doc('deletedUsers/storage-alice').set({deleted:true});
 assert.equal((await fetch(url(),{headers:{Authorization:'Bearer '+alice}})).status,403);
});
test('cost/pricing/job internals are operator-only; members cannot mutate credits or style directly',async()=>{
 const owner=env.authenticatedContext('storage-bob',{email_verified:true}).firestore();
 const admin=env.authenticatedContext('operator',{admin:true}).firestore();
 for(const collection of ['generationCosts','dailyCosts','generationInternal','ops']){
  await db.doc(`${collection}/rule-fixture`).set({uid:'storage-bob',chargedMicros:10});
  await assertFails(getDoc(doc(owner,collection,'rule-fixture')));
  await assertSucceeds(getDoc(doc(admin,collection,'rule-fixture')));
  await assertFails(setDoc(doc(owner,collection,'forged'),{uid:'storage-bob',chargedMicros:0}));
 }
 await assertFails(setDoc(doc(owner,'users/storage-bob'),{credits:100,freeCredits:100,blogStyle:{greeting:'forged'}}));
});
