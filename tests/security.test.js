import { readFile } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where } from 'firebase/firestore';
let env;
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-jaeinit',firestore:{rules:await readFile('firestore.rules','utf8')}});
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  for(const uid of ['alice','bob']){
   await setDoc(doc(db,'users',uid),{uid,credits:5});
   for(const name of ['creditLedger','orders','generations','posts'])await setDoc(doc(db,name,uid),{uid,body:'private'});
   await setDoc(doc(db,`posts/${uid}/photoChunks/0`),{value:'private-image'});
  }
  await setDoc(doc(db,'creditPackages','credits_10'),{credits:10,priceKRW:1000,active:true});
  await setDoc(doc(db,'signupClaims','private'),{firstUid:'alice'});
 });
});
after(()=>env.cleanup());
test('anonymous cannot read any member records or packages',async()=>{
 const db=env.unauthenticatedContext().firestore();
 for(const name of ['users','creditLedger','orders','generations','posts'])await assertFails(getDoc(doc(db,name,'alice')));
 await assertFails(getDoc(doc(db,'creditPackages','credits_10')));
});
test('owners can read own records but not other users; queries must constrain uid',async()=>{
 const db=env.authenticatedContext('alice').firestore();
 for(const name of ['users','creditLedger','orders','generations','posts']){
  await assertSucceeds(getDoc(doc(db,name,'alice')));
  await assertFails(getDoc(doc(db,name,'bob')));
 }
 for(const name of ['creditLedger','orders','generations','posts']){
  await assertSucceeds(getDocs(query(collection(db,name),where('uid','==','alice'))));
  await assertFails(getDocs(collection(db,name)));
  await assertFails(getDocs(query(collection(db,name),where('uid','==','bob'))));
 }
 await assertFails(getDoc(doc(db,'posts/alice/photoChunks/0')));
 await assertFails(getDoc(doc(db,'posts/bob/photoChunks/0')));
});
test('clients cannot create, update, delete credits or forge owners, including admin credit edits',async()=>{
 for(const context of [env.authenticatedContext('alice'),env.authenticatedContext('admin',{admin:true})]){
  const db=context.firestore();
  for(const name of ['users','creditLedger','orders','generations','posts']){
   await assertFails(setDoc(doc(db,name,'forged'),{uid:'alice',credits:999}));
   for(const target of ['alice','bob']){
    await assertFails(updateDoc(doc(db,name,target),{credits:999,uid:'bob'}));
    await assertFails(deleteDoc(doc(db,name,target)));
   }
  }
  await assertFails(setDoc(doc(db,'posts/alice/photoChunks/forged'),{value:'x'}));
  await assertFails(getDoc(doc(db,'signupClaims/private')));
  await assertFails(setDoc(doc(db,'signupClaims/forged'),{firstUid:'alice'}));
 }
});
test('catalog writes require admin claim and validated package, never profile role',async()=>{
 const user=env.authenticatedContext('alice').firestore();
 const admin=env.authenticatedContext('admin',{admin:true}).firestore();
 await assertSucceeds(getDoc(doc(user,'creditPackages/credits_10')));
 await assertFails(setDoc(doc(user,'creditPackages/credits_30'),{credits:30,priceKRW:5000,active:true}));
 await assertSucceeds(setDoc(doc(admin,'creditPackages/credits_30'),{credits:30,priceKRW:5000,active:true}));
 await assertFails(setDoc(doc(admin,'creditPackages/invalid'),{credits:999,priceKRW:1,active:true}));
 await assertFails(setDoc(doc(admin,'creditPackages/invalid'),{credits:10,priceKRW:-1,active:true}));
 await assertFails(setDoc(doc(admin,'creditPackages/invalid'),{credits:10,priceKRW:1,active:true,secret:'leak'}));
 await assertSucceeds(getDoc(doc(admin,'users/bob')));
});
