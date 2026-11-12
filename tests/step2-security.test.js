import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc} from 'firebase/firestore';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-jaeinit',firestore:{rules:await readFile('firestore.rules','utf8')}});await env.withSecurityRulesDisabled(async c=>{
 const db=c.firestore();for(const path of ['users/policy-owner/styles/default','exportApprovals/own','photoGroups/legacy'])await setDoc(doc(db,path),{uid:'policy-owner'});
 for(const name of ['generationCosts','dailyCosts','generationInternal','ops'])await setDoc(doc(db,name,'private'),{uid:'policy-owner',spentMicros:10});
 });});
after(()=>env.cleanup());
test('owner styles and export approvals are private; legacy photo metadata and chunks are closed',async()=>{
 for(const uid of ['policy-owner','policy-other']){
  const db=env.authenticatedContext(uid).firestore();
  for(const path of ['users/policy-owner/styles/default','exportApprovals/own'])await(uid==='policy-owner'?assertSucceeds:assertFails)(getDoc(doc(db,path)));
  for(const path of ['photoGroups/legacy','posts/alice/photoChunks/0'])await assertFails(getDoc(doc(db,path)));
 }
});
test('tier, credits, usage counters, styles and export approvals cannot be forged by browsers',async()=>{
 const db=env.authenticatedContext('policy-owner').firestore();
 for(const [path,value] of [['users/policy-owner',{tier:'PRO',credits:999,exportsUsed:0,savedPostCount:0}],['users/policy-owner/styles/forged',{style:{}}],['exportApprovals/forged',{uid:'policy-owner'}],['ops/service',{signupCredits:100}]])await assertFails(setDoc(doc(db,path),value));
});
test('operator costs and internal config remain operator-only and never browser-writable',async()=>{
 const owner=env.authenticatedContext('policy-owner').firestore(),admin=env.authenticatedContext('operator',{admin:true}).firestore();
 for(const name of ['generationCosts','dailyCosts','generationInternal','ops']){
  await assertFails(getDoc(doc(owner,name,'private')));await assertSucceeds(getDoc(doc(admin,name,'private')));await assertFails(setDoc(doc(admin,name,'forged'),{enabled:true}));
 }
});
