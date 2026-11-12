import {auth} from './firebase.js';
import {generate,uploadPhotos,getGeneration,watchGenerations} from './api.js';
const el=id=>document.getElementById(id);
const active=g=>['reserved','running'].includes(g.status);
const phases={queued:'생성 요청 접수 · 1크레딧 예약',starting:'서버 작업 시작',searching:'장소 정보 검색 중',generating:'Claude가 포스팅 작성 중',completed:'생성 완료',refunded:'생성 실패 · 예약 크레딧 복구 완료'};
export function initGenerationUI({onResult,onError}){
 let uid=null,epoch=0,stop=()=>{},current=null,waiting=false;
 const handled=new Set();
 const key=()=>`jaeinit_generation_pending_${uid}`;
 const read=()=>{try{return JSON.parse(localStorage.getItem(key())||'null');}catch{return null;}};
 const store=p=>localStorage.setItem(key(),JSON.stringify(p));
 const message=text=>{el('generationStatus').textContent=text;};
 function button(){el('gb').disabled=waiting||!!(current&&active(current));}
 async function display(record){
  const started=epoch;
  const full=await getGeneration(record.id);
  if(started!==epoch)return;
  await onResult(full);
  if(started!==epoch)return;
  message((full.provider==='mock'?'테스트(mock) ':'')+'생성 완료 · 1크레딧 사용'+(full.photosExpired?' · 미저장 사진의 보관 기간이 지났습니다.':''));
 }
 function render(records){
  el('generationHistory').replaceChildren(...records.map(g=>{
   const card=document.createElement('div');card.className='kc';card.style.marginBottom='10px';
   const title=document.createElement('div');title.className='kv';title.textContent=g.input?.title||g.id;
   const status=document.createElement('div');status.className='hint';status.textContent=(g.provider==='mock'?'[mock] ':'')+(phases[g.phase]||g.status);
   const load=document.createElement('button');load.className='ab';load.textContent=g.status==='succeeded'?'결과·사진 불러오기':'상태 확인';
   load.onclick=()=>{if(g.status==='succeeded')void display(g).catch(e=>onError(e.message));else message(phases[g.phase]||g.status);};
   card.append(title,status,load);return card;
  }));
 }
 return {
  busy:()=>waiting||!!(current&&active(current)),
  profile(profile){el('creditHint').textContent=(profile?.credits===0?'잔액 0개 · 크레딧 충전 기능은 준비 중입니다. ':'')+'새 AI 생성 1회 = 1크레딧 예약 · 실패 시 원래 크레딧으로 복구 · 복사/수정/저장은 무료';},
  session(nextUid){
   epoch++;stop();uid=nextUid;current=null;waiting=false;handled.clear();el('generationHistory').replaceChildren();button();
   if(!uid)return;
   const sessionEpoch=epoch;
   stop=watchGenerations(uid,records=>{
    if(sessionEpoch!==epoch)return;
    render(records);
    const pending=read();
    const g=records.find(r=>pending&&(r.id===pending.id||r.requestId===pending.requestId))||records.find(active);
    if(!g)return;
    current=g;waiting=false;
    if(active(g)){
     if(!pending)store({requestId:g.requestId,id:g.id,payload:{...g.input,requestId:g.requestId,photoGroupId:g.photoGroupId}});
     message(phases[g.phase]||'생성 진행 상태 복구 중');
     el('load').className='load on';el('lst').textContent=phases[g.phase]||'처리 중';
     el('sb').textContent=g.partialText||'';el('lb').style.width=g.phase==='generating'?'65%':'25%';
    }else if(!handled.has(g.id)){
     handled.add(g.id);localStorage.removeItem(key());el('load').className='load';
     if(g.status==='succeeded')void display(g).catch(e=>onError(e.message));
     else message('생성에 실패했습니다. 예약한 '+(g.creditType==='paid'?'유료':'무료')+' 크레딧 1개가 복구됐습니다.');
    }
    button();
   },e=>onError(e.message));
  },
  async submit(input,photos){
   if(!uid||auth.currentUser?.uid!==uid)throw new Error('로그인이 필요합니다.');
   if(photos.length>10)throw new Error('생성 사진은 최대 10장입니다. 기기 원본은 유지됩니다.');
   waiting=true;button();const started=epoch;
   let pending=read();
   if(!pending){
    pending={requestId:crypto.randomUUID(),payload:{...input}};pending.payload.requestId=pending.requestId;
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(uid+'\0'+pending.requestId));
    pending.id=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');store(pending);
   }
   try{
    if(photos.length&&!pending.payload.photoGroupId){
     message('사진을 비공개 저장소에 업로드 중');
     const uploaded=await uploadPhotos({requestId:pending.requestId,photos});
     if(started!==epoch)return;
     pending.payload.photoGroupId=uploaded.photoGroupId;store(pending);
    }
    const accepted=await generate(pending.payload,()=>message('서버 요청 접수 중'));
    if(started!==epoch)return;
    if(current?.id===accepted.generationId&&!active(current)){localStorage.removeItem(key());return;}
    pending.id=accepted.generationId;store(pending);message('생성 요청이 접수됐습니다. 페이지를 새로고침해도 서버 결과를 복구합니다.');
   }catch(e){
    if(started!==epoch)return;
    if(['functions/invalid-argument','functions/resource-exhausted','functions/failed-precondition'].includes(e.code))localStorage.removeItem(key());
    else message('연결 상태를 확인해주세요. 같은 요청 ID로 다시 연결하며 중복 차감하지 않습니다.');
    throw e;
   }finally{if(started===epoch){waiting=false;button();}}
  }
 };
}
