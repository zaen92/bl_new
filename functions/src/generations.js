import {createHash,randomUUID} from 'node:crypto';
import {HttpsError} from 'firebase-functions/v2/https';
import {FieldValue,Timestamp} from './admin.js';
import {parseResult} from './ai-provider.js';
import {buckets,configFrom,maxCost,usageCost,validateStyle} from './ai-config.js';
export const generationId=(uid,key)=>createHash('sha256').update(uid+'\0'+key).digest('hex');
const terminal=s=>['succeeded','failed_refunded'].includes(s);
export function validateInput(data){
 if(!data||typeof data.requestId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(data.requestId))throw new HttpsError('invalid-argument','고유 요청 ID가 필요합니다.');
 const input={};
 for(const [k,max] of Object.entries({title:500,memo:2000,content:12000,placeInfo:2000,type:50,volume:10})){
  const v=data[k]??'';if(typeof v!=='string'||v.length>max)throw new HttpsError('invalid-argument','입력 길이 또는 형식을 확인하세요.');input[k]=v;
 }
 if(!input.title.trim()||!input.content.trim()||!['short','normal','long'].includes(input.volume)||!['맛집','카페','여행','숙소','캠핑','미용','쇼핑','투어','전시'].includes(input.type))throw new HttpsError('invalid-argument','제목·내용·유형·분량이 필요합니다.');
 if(data.photos?.length)throw new HttpsError('invalid-argument','사진은 비공개 업로드 API를 먼저 사용하세요.');
 const photoGroupId=data.photoGroupId??null;
 if(photoGroupId!==null&&(typeof photoGroupId!=='string'||!/^[a-f0-9]{64}$/.test(photoGroupId)))throw new HttpsError('invalid-argument','사진 ID 오류');
 return {input,photoGroupId,requestId:data.requestId};
}
export async function reserveGeneration(db,uid,data,{now=Date.now(),enqueue=true}={}){
 const {input,photoGroupId,requestId}=validateInput(data);
 const id=generationId(uid,requestId),ref=db.doc(`generations/${id}`);
 const fingerprint=createHash('sha256').update(JSON.stringify({input,photoGroupId})).digest('hex');
 return db.runTransaction(async tx=>{
  const internalRef=db.doc(`generationInternal/${id}`);
  const [old,user,ops,deleted,internal]=await tx.getAll(ref,db.doc(`users/${uid}`),db.doc('ops/ai'),db.doc(`deletedUsers/${uid}`),internalRef);
  if(deleted.exists||!user.exists)throw new HttpsError('failed-precondition','회원 초기화가 필요합니다.');
  if(old.exists){if(internal.data()?.fingerprint!==fingerprint)throw new HttpsError('already-exists','같은 요청 ID에 다른 내용을 사용할 수 없습니다.');return {generationId:id,status:old.data().status,creditsRemaining:user.data().credits,duplicate:true};}
  const c=configFrom(ops);
  if(!c.enabled)throw new HttpsError('unavailable','현재 생성 서비스가 일시 중지되었습니다.');
  const day=new Date(now).toISOString().slice(0,10),minute=Math.floor(now/60000);
  const budgetRef=db.doc(`dailyCosts/${day}`);
  const budget=await tx.get(budgetRef);
  const group=photoGroupId?await tx.get(db.doc(`photoGroups/${photoGroupId}`)):null;
  if(group&&(!group.exists||group.data().uid!==uid||group.data().status!=='ready'))throw new HttpsError('permission-denied','사용할 수 없는 사진입니다.');
  const u=user.data(),balance=buckets(u);
  if(u.credits<1)throw new HttpsError('resource-exhausted','크레딧이 없습니다. 충전 기능은 준비 중입니다.');
  const limits=u.aiLimits||{};
  const minuteCount=limits.minute===minute?limits.minuteCount:0,dayCount=limits.day===day?limits.dayCount:0;
  if(minuteCount>=c.perMinute||dayCount>=c.perDay||(u.activeGenerations||0)>=c.concurrent)throw new HttpsError('resource-exhausted','생성 요청 제한에 도달했습니다. 잠시 후 다시 시도하세요.');
  const bound=maxCost(c),b=budget.data()||{};
  if((b.spentMicros||0)+(b.reservedMicros||0)+bound>c.dailyBudgetMicros)throw new HttpsError('resource-exhausted','서비스 일일 비용 한도에 도달했습니다.');
  const creditType=balance.freeCredits>0?'free':'paid';
  balance[creditType==='free'?'freeCredits':'paidCredits']--;
  balance[creditType==='free'?'heldFree':'heldPaid']++;
  const createdAt=FieldValue.serverTimestamp();
  const style=validateStyle(u.blogStyle||{preset:'jaeinit'});
  const value={uid,requestId,fingerprint,status:'reserved',phase:'queued',creditType,photoGroupId,input,style,config:c,
   day,budgetReservedMicros:bound,leaseUntil:Timestamp.fromMillis(now+c.timeoutMs+120000),createdAt,updatedAt:createdAt,schemaVersion:2};
  const {config:privateConfig,budgetReservedMicros,day:privateDay,fingerprint:privateHash,...publicValue}=value;
  tx.create(ref,publicValue);
  tx.create(internalRef,{config:privateConfig,budgetReservedMicros,day:privateDay,fingerprint:privateHash});
  if(enqueue)tx.create(db.doc(`generationJobs/${id}`),{uid,generationId:id,createdAt});
  tx.update(user.ref,{...balance,credits:u.credits-1,activeGenerations:(u.activeGenerations||0)+1,
   aiLimits:{minute,minuteCount:minuteCount+1,day,dayCount:dayCount+1},updatedAt:createdAt});
  tx.set(budgetRef,{day,reservedMicros:(b.reservedMicros||0)+bound,spentMicros:b.spentMicros||0});
  if(group)tx.update(group.ref,{expiresAt:group.data().savedRefs>0?FieldValue.delete():Timestamp.fromMillis(now+c.retentionDays*86400000),lastUsedAt:createdAt});
  tx.create(db.doc(`creditLedger/${id}_reserve`),{uid,delta:-1,balanceAfter:u.credits-1,reason:'generation_reserve',creditType,referenceId:id,createdAt});
  return {generationId:id,status:'reserved',creditsRemaining:u.credits-1,duplicate:false};
 });
}
async function settle(db,id,{result=null,errorCode=null,usage=null,provider='unknown',attempt=null,now=Date.now()}={}){
 return db.runTransaction(async tx=>{
  const ref=db.doc(`generations/${id}`);
  const g=await tx.get(ref);
  if(!g.exists)return false;
  const [internal,deleted]=await tx.getAll(db.doc(`generationInternal/${id}`),db.doc(`deletedUsers/${g.data().uid}`));
  if(!g.exists||!internal.exists)return false;
  const v={...g.data(),...internal.data()},costRef=db.doc(`generationCosts/${id}`),cost=await tx.get(costRef);
  const budgetRef=db.doc(`dailyCosts/${v.day}`),budget=await tx.get(budgetRef);
  const user=await tx.get(db.doc(`users/${v.uid}`));
  const canFinish=!terminal(v.status)&&(!attempt||v.attempt===attempt);
  // Unknown provider failures are conservatively charged at the reservation bound.
  const actual=usage?usageCost(v.config,usage):v.providerAttempted?v.budgetReservedMicros:0;
  if(!canFinish){
   if(usage&&cost.exists&&cost.data().estimated){
    const previous=cost.data().chargedMicros;
    tx.update(costRef,{usage,chargedMicros:actual,estimated:false,provider,updatedAt:FieldValue.serverTimestamp()});
    tx.update(budgetRef,{spentMicros:Math.max(0,(budget.data()?.spentMicros||0)-previous+actual)});
   }
   return false;
  }
  if(deleted.exists){result=null;errorCode='account_deleted';}
  if(result && v.leaseUntil.toMillis()<now){result=null;errorCode='expired';}
  const success=!!result,stamp=FieldValue.serverTimestamp();
  if(user.exists){
   const u=user.data(),b=buckets(u),held=v.creditType==='free'?'heldFree':'heldPaid';
   if(b[held]<1)throw new HttpsError('failed-precondition','예약 잔액 일관성 오류');
   b[held]--;
   if(!success)b[v.creditType==='free'?'freeCredits':'paidCredits']++;
   tx.update(user.ref,{...b,credits:u.credits+(success?0:1),activeGenerations:Math.max(0,(u.activeGenerations||0)-1),updatedAt:stamp});
   tx.create(db.doc(`creditLedger/${id}_${success?'commit':'refund'}`),{uid:v.uid,delta:success?0:1,balanceAfter:u.credits+(success?0:1),reason:success?'generation_commit':'generation_refund',creditType:v.creditType,referenceId:id,createdAt:stamp});
  }
  tx.update(ref,{status:success?'succeeded':'failed_refunded',phase:success?'completed':'refunded',result:result||null,provider,leaseUntil:FieldValue.delete(),
   errorCode:success?null:errorCode||'generation_failed',partialText:FieldValue.delete(),completedAt:stamp,updatedAt:stamp});
  tx.set(costRef,{uid:v.uid,generationId:id,provider,pricing:{inputMicrosPerToken:v.config.inputMicrosPerToken,outputMicrosPerToken:v.config.outputMicrosPerToken,searchMicros:v.config.searchMicros},usage,chargedMicros:actual,estimated:!usage,providerCalls:v.providerAttempted?1:0,
   reservationMicros:v.budgetReservedMicros,errorCode:errorCode||null,createdAt:stamp});
  const b=budget.data()||{};
  tx.set(budgetRef,{day:v.day,reservedMicros:Math.max(0,(b.reservedMicros||0)-v.budgetReservedMicros),spentMicros:(b.spentMicros||0)+actual});
  return true;
 });
}
export async function runGeneration(db,id,{provider,loadPhotos=async()=>[],now=()=>Date.now()}={}){
 const attempt=randomUUID(),ref=db.doc(`generations/${id}`);
 const job=await db.runTransaction(async tx=>{
  const g=await tx.get(ref);
  if(!g.exists)return null;
  const [ops,deleted]=await tx.getAll(db.doc('ops/ai'),db.doc(`deletedUsers/${g.data().uid}`));
  if(!g.exists||g.data().status!=='reserved'||g.data().providerAttempted)return null;
  const internal=await tx.get(db.doc(`generationInternal/${id}`));
  if(!internal.exists)return null;
  const v={...g.data(),...internal.data()};
  if(deleted.exists||!configFrom(ops).enabled||v.leaseUntil.toMillis()<=now())return {...v,blocked:true};
  tx.update(ref,{status:'running',phase:'starting',attempt,executionClaimed:true,startedAt:FieldValue.serverTimestamp()});
  return v;
 });
 if(!job)return {claimed:false};
 if(job.blocked){await settle(db,id,{errorCode:'paused_or_expired',now:now()});return {claimed:false};}
 const abort=new AbortController();let timer;
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Object.assign(new Error('timeout'),{code:'timeout'}));},job.config.timeoutMs);});
 let lastProgress=0,lastPhase='';
 const work=(async()=>{
  const photos=await loadPhotos(job.uid,job.photoGroupId);
  const allowed=await db.runTransaction(async tx=>{
   const [g,ops,deleted]=await tx.getAll(ref,db.doc('ops/ai'),db.doc(`deletedUsers/${job.uid}`));
   if(!g.exists||g.data().status!=='running'||g.data().attempt!==attempt||g.data().leaseUntil.toMillis()<now()||deleted.exists||!configFrom(ops).enabled)return false;
   tx.update(ref,{providerAttempted:true});return true;
  });
  if(!allowed)throw Object.assign(new Error('cancelled'),{code:'cancelled'});
  return provider({input:job.input,style:job.style,config:job.config,photos,signal:abort.signal,onProgress:async update=>{
   if(now()-lastProgress<500&&update.phase===lastPhase)return;lastProgress=now();lastPhase=update.phase;
   await db.runTransaction(async tx=>{
    const g=await tx.get(ref);if(!g.exists||g.data().status!=='running'||g.data().attempt!==attempt)return;
    tx.update(ref,{phase:update.phase,partialText:String(update.text||'').slice(0,100000),updatedAt:FieldValue.serverTimestamp()});
   });
  }});
 })();
 try{
  const outcome=await Promise.race([work,timeout]);
  outcome.result=parseResult(JSON.stringify(outcome.result));
  await settle(db,id,{...outcome,attempt,now:now()});
 }catch(error){await settle(db,id,{errorCode:typeof error.code==='string'?error.code.replace(/[^a-z0-9_-]/gi,'').slice(0,80):abort.signal.aborted?'timeout':'generation_failed',usage:error.usage||null,attempt,now:now()});
  if(abort.signal.aborted)void work.then(outcome=>settle(db,id,{...outcome,result:null,errorCode:'timeout',attempt,now:now()})).catch(()=>{});
 }
 finally{clearTimeout(timer);}
 return {claimed:true};
}
export async function recoverExpired(db,{now=Date.now(),limit=100}={}){
 // Range query uses only the lease field; terminal docs are harmlessly ignored.
 const snapshot=await db.collection('generations').where('leaseUntil','<=',Timestamp.fromMillis(now)).limit(limit).get();
 let recovered=0;
 for(const g of snapshot.docs)if(!terminal(g.data().status))if(await settle(db,g.id,{errorCode:'expired',now}))recovered++;
 return {recovered};
}
export async function saveBlogStyle(db,uid,style){
 const value=validateStyle(style);await db.doc(`users/${uid}`).update({blogStyle:value,updatedAt:FieldValue.serverTimestamp()});return value;
}
