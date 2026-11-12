import {createHash} from 'node:crypto';
import {HttpsError} from 'firebase-functions/v2/https';
import {FieldValue} from './admin.js';
import {validateStyle} from './ai-config.js';
import {policyFrom,tierOf,limitError} from './service-policy.js';
const idOK=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
export async function approveExport(db,uid,{requestId,digest,bytes}={}){
 if(!idOK(requestId)||!/^([a-f0-9]{64})$/.test(digest||'')||!Number.isSafeInteger(bytes)||bytes<2||bytes>50*1024*1024)throw new HttpsError('invalid-argument','파일을 먼저 검증하세요.');
 const ref=db.doc(`exportApprovals/${createHash('sha256').update(uid+'\0'+requestId).digest('hex')}`);
 return db.runTransaction(async tx=>{
  const [old,user,policy,deleted]=await tx.getAll(ref,db.doc(`users/${uid}`),db.doc('ops/service'),db.doc(`deletedUsers/${uid}`));
  if(!user.exists||deleted.exists)throw new HttpsError('failed-precondition','회원 확인이 필요합니다.');
  if(old.exists){if(old.data().digest!==digest||old.data().bytes!==bytes)throw new HttpsError('already-exists','승인 ID 파일이 다릅니다.');return {approved:true,exportsUsed:old.data().exportsUsed,duplicate:true};}
  const u=user.data(),claim=u.signupClaimId?await tx.get(db.doc(`signupClaims/${u.signupClaimId}`)):null;
  const used=Math.max(u.exportsUsed||0,claim?.data()?.exportsUsed||0);
  if(tierOf(u)==='FREE'&&used>=policyFrom(policy).freeExportLimit)throw limitError('exports');
  tx.create(ref,{uid,digest,bytes,exportsUsed:used+1,createdAt:FieldValue.serverTimestamp()});
  tx.update(user.ref,{exportsUsed:used+1});if(claim?.exists)tx.update(claim.ref,{exportsUsed:used+1});
  return {approved:true,exportsUsed:used+1,duplicate:false};
 });
}
export async function saveBlogStyle(db,uid,value){
 const id=value.id??'default';if(!idOK(id))throw new HttpsError('invalid-argument','스타일 ID 오류');
 const style=validateStyle(value.style??value),ref=db.doc(`users/${uid}/styles/${id}`);
 return db.runTransaction(async tx=>{
  const [user,old,policy,deleted]=await tx.getAll(db.doc(`users/${uid}`),ref,db.doc('ops/service'),db.doc(`deletedUsers/${uid}`));
  if(!user.exists||deleted.exists)throw new HttpsError('failed-precondition','회원 확인 필요');
  const docs=await tx.get(db.collection(`users/${uid}/styles`));
  const legacy=user.data().blogStyle&&!user.data().activeStyleId&&!docs.docs.some(d=>d.id==='default');
  const count=docs.size+(legacy?1:0),adding=!old.exists&&!(id==='default'&&legacy);
  const c=policyFrom(policy),limit=tierOf(user.data())==='PRO'?c.proStyleLimit:c.freeStyleLimit;
  if(adding&&count>=limit)throw limitError('styles');
  if(legacy&&id!=='default')tx.create(db.doc(`users/${uid}/styles/default`),{uid,style:user.data().blogStyle,updatedAt:FieldValue.serverTimestamp()});
  tx.set(ref,{uid,style,updatedAt:FieldValue.serverTimestamp()});
  tx.update(user.ref,{blogStyle:style,activeStyleId:id,styleCount:count+(adding?1:0)});
  return {...style,id};
 });
}
export async function listStyles(db,uid){
 const user=await db.doc(`users/${uid}`).get(),docs=await db.collection(`users/${uid}/styles`).get();
 const styles=docs.docs.map(d=>({id:d.id,...d.data().style}));
 if(user.data()?.blogStyle&&!user.data()?.activeStyleId&&!styles.some(s=>s.id==='default'))styles.unshift({id:'default',...user.data().blogStyle});
 return {styles,activeStyleId:user.data()?.activeStyleId||'default'};
}
export async function selectStyle(db,uid,{id}){
 if(!idOK(id))throw new HttpsError('invalid-argument','스타일 ID 오류');
 return db.runTransaction(async tx=>{
  const [user,style]=await tx.getAll(db.doc(`users/${uid}`),db.doc(`users/${uid}/styles/${id}`));
  const value=style.data()?.style||(id==='default'?user.data()?.blogStyle:null);
  if(!value)throw new HttpsError('not-found','스타일이 없습니다.');
  tx.update(user.ref,{activeStyleId:id,blogStyle:value});return {selected:id};
 });
}
export async function deleteStyle(db,uid,{id}){
 if(!idOK(id))throw new HttpsError('invalid-argument','스타일 ID 오류');
 return db.runTransaction(async tx=>{
  const user=await tx.get(db.doc(`users/${uid}`)),rows=await tx.get(db.collection(`users/${uid}/styles`));
  const exists=rows.docs.some(d=>d.id===id)||(id==='default'&&user.data()?.blogStyle&&!user.data()?.activeStyleId&&!rows.docs.some(d=>d.id==='default'));
  if(!exists)return {deleted:false};
  tx.delete(db.doc(`users/${uid}/styles/${id}`));
  const update={styleCount:Math.max(0,rows.size+(user.data()?.blogStyle&&!user.data()?.activeStyleId&&!rows.docs.some(d=>d.id==='default')?1:0)-1)};
  if((user.data()?.activeStyleId||'default')===id){update.activeStyleId=FieldValue.delete();update.blogStyle=FieldValue.delete();}
  tx.update(user.ref,update);return {deleted:true};
 });
}
