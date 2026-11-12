import {HttpsError} from 'firebase-functions/v2/https';
import {FieldValue} from './admin.js';
import {plainText,policyFrom,tierOf,limitError} from './service-policy.js';
const fail=m=>{throw new HttpsError('invalid-argument',m);};
const idPattern=/^[A-Za-z0-9_-]{1,100}$/;
const resultFields=['title_1','title_2','title_3','keyword_main','keyword_sub','keyword_location','keyword_intent','place_name','place_address','place_hours','place_price','body','reel','thumbnail'];
export function validatePost(input){
 if(!input||!idPattern.test(input.id||'')||!idPattern.test(input.requestId||''))fail('잘못된 요청 ID입니다.');
 if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0||input.expectedVersion>1e9)fail('버전이 필요합니다.');
 const p=input.post;if(!p?.data||typeof p.data!=='object')fail('본문이 필요합니다.');
 if(p.imgs?.length||input.photoGroupId)fail('사진을 제외한 텍스트만 저장하세요.');
 const data={};for(const f of resultFields)data[f]=plainText(p.data[f]??'',f==='body'?60000:10000);
 if(!Array.isArray(p.data.hashtags)||p.data.hashtags.length>50)fail('태그 형식 오류');
 data.hashtags=p.data.hashtags.map(t=>plainText(t,200));
 const form={};for(const f of ['ti','mi','ci','ii'])form[f]=plainText(p.form?.[f]??'',20000);
 const photoPositions=[...new Set([...data.body.matchAll(/\[사진(\d{1,2})\]/g)].map(m=>Number(m[1])).filter(n=>n>0&&n<=10))];
 const style=p.style?Object.fromEntries(['blogName','greeting','closing','tone','instructions','preset'].map(k=>[k,plainText(p.style[k]??'',1500)])):null;
 if(style)style.emoji=p.style.emoji!==false;
 const post={title:plainText(p.title,500),type:plainText(p.type??'',50),volume:plainText(p.volume??'',20),date:plainText(p.date??'',100),data,form,style,photoPositions,schemaVersion:3};
 if(Buffer.byteLength(JSON.stringify(post))>650000)fail('본문과 원문이 너무 큽니다.');
 return {id:input.id,requestId:input.requestId,expectedVersion:input.expectedVersion,post,photos:[]};
}
export async function saveOwnedPost(db,uid,input){
 const {id,requestId,expectedVersion,post}=validatePost(input),ref=db.doc(`posts/${id}`);
 return db.runTransaction(async tx=>{
  const [old,user,policy,deleted]=await tx.getAll(ref,db.doc(`users/${uid}`),db.doc('ops/service'),db.doc(`deletedUsers/${uid}`));
  if(old.exists&&old.data().uid!==uid)throw new HttpsError('permission-denied','다른 회원의 글입니다.');
  if(!user.exists||deleted.exists)throw new HttpsError('failed-precondition','회원 초기화가 필요합니다.');
  if(old.exists&&old.data().lastRequestId===requestId)return {id,version:old.data().version};
  if((old.data()?.version??0)!==expectedVersion)throw new HttpsError('aborted','다른 기기에서 수정했습니다. 다시 불러오세요.');
  const u=user.data(),count=Number.isSafeInteger(u.savedPostCount)?u.savedPostCount:(await tx.get(db.collection('posts').where('uid','==',uid))).size;
  if(!old.exists&&tierOf(u)==='FREE'&&count>=policyFrom(policy).freePostLimit)throw limitError('posts');
  tx.set(ref,{...post,uid,version:expectedVersion+1,lastRequestId:requestId,createdAt:old.data()?.createdAt??FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  tx.update(user.ref,{savedPostCount:count+(old.exists?0:1)});
  // Legacy chunks/Storage objects remain untouched for separate, approved migration.
  return {id,version:expectedVersion+1};
 });
}
export async function loadOwnedPost(db,uid,id){
 if(typeof id!=='string'||!idPattern.test(id))fail('잘못된 글 ID입니다.');
 const snapshot=await db.doc(`posts/${id}`).get();
 if(!snapshot.exists)throw new HttpsError('not-found','글이 없습니다.');
 if(snapshot.data().uid!==uid)throw new HttpsError('permission-denied','다른 회원의 글입니다.');
 const value=snapshot.data();
 const clean=validatePost({id,requestId:'read',expectedVersion:value.version||0,post:{...value,imgs:[]}}).post;
 return {...clean,id,uid,version:value.version||0,createdAt:value.createdAt,updatedAt:value.updatedAt,imgs:[],photosRequireAttachment:true};
}
export async function deleteOwnedPost(db,uid,{id,requestId}){
 if(!idPattern.test(id||'')||!idPattern.test(requestId||''))fail('글 삭제 요청 ID 오류');
 return db.runTransaction(async tx=>{
  const [post,user]=await tx.getAll(db.doc(`posts/${id}`),db.doc(`users/${uid}`));
  if(!user.exists)throw new HttpsError('failed-precondition','회원 초기화 필요');
  if(!post.exists)return {deleted:false};
  if(post.data().uid!==uid)throw new HttpsError('permission-denied','다른 회원의 글입니다.');
  const count=Number.isSafeInteger(user.data().savedPostCount)?user.data().savedPostCount:(await tx.get(db.collection('posts').where('uid','==',uid))).size;
  tx.delete(post.ref);tx.update(user.ref,{savedPostCount:Math.max(0,count-1)});
  return {deleted:true};
 });
}
export async function listOwnedPosts(db,uid,{cursor=null,pageSize=20}={}){
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>50)fail('페이지 크기 오류');
 let q=db.collection('posts').where('uid','==',uid).orderBy('updatedAt','desc').orderBy('__name__','desc');
 if(cursor){if(!idPattern.test(cursor))fail('커서 오류');const doc=await db.doc(`posts/${cursor}`).get();if(!doc.exists||doc.data().uid!==uid)throw new HttpsError('permission-denied','커서 권한 오류');q=q.startAfter(doc);}
 const rows=await q.limit(pageSize+1).get();const page=rows.docs.slice(0,pageSize);
 const posts=await Promise.all(page.map(d=>loadOwnedPost(db,uid,d.id)));
 return {posts,nextCursor:rows.size>pageSize?page.at(-1).id:null};
}
