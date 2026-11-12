import { auth } from './firebase.js';
import { saveCloudPost, loadCloudPost,listCloudPosts,deleteCloudPost } from './api.js';
import {initGenerationUI} from './generation-ui.js';
import {initBlogStyle} from './blog-style.js';
import { initAccount } from './account.js';
import { localPosts, putLocalPost, deleteLocalPost, getDraft, putDraft, migrateLegacy, exportBackup, importBackup } from './local-store.js';
var sT='',sV='',imgs=[],resultData=null;
let draftReady=false;
let cloudPosts=[];
let accountEpoch=0;
let currentStyle=null;
let generationUI;
const updateStyleProfile=initBlogStyle();
function escapeHtml(value){return String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeImage(value){return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)?value:'';}
function setError(message){if(/FREE 기능 한도/.test(message))g('proModal').className='modal';g('eb').textContent=message;g('eb').className='err on';}
function openSettings(){g('modal').className='modal';}
function closeModal(){g('modal').className='modal hide';}
function g(id){return document.getElementById(id);}
function st(b,t){document.querySelectorAll('.tb').forEach(function(x){x.classList.remove('on');});b.classList.add('on');sT=t;queueDraft();}
function sv(b,v){document.querySelectorAll('.vb').forEach(function(x){x.classList.remove('on');});b.classList.add('on');sV=v;queueDraft();}

/* 탭 전환 */
function switchTab(tab){
  g('tabResult').className='tab-btn'+(tab==='result'?' on':'');
  g('tabPreview').className='tab-btn'+(tab==='preview'?' on':'');
  g('tabHistory').className='tab-btn'+(tab==='history'?' on':'');
  g('rightHistory').style.display=tab==='history'?'flex':'none';
  g('tabSaved').className='tab-btn'+(tab==='saved'?' on':'');
  g('rightResult').style.display=tab==='result'?'flex':'none';
  g('rightPreview').style.display=tab==='preview'?'flex':'none';
  g('rightSaved').style.display=tab==='saved'?'flex':'none';
  if(tab==='preview') renderPreview();
  if(tab==='saved') renderSavedList();
}

/* 이미지 압축 */
function compress(file){
  return new Promise((resolve,reject)=>{
    if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type)){reject(new Error('JPG, PNG, WebP, GIF 사진만 지원합니다.'));return;}
    const reader=new FileReader();reader.onerror=()=>reject(new Error('사진 파일을 읽을 수 없습니다.'));
    reader.onload=()=>{
      const image=new Image();image.onerror=()=>reject(new Error('사진 형식을 읽을 수 없습니다.'));
      image.onload=()=>{
        try{
          const ratio=Math.min(1400/image.width,1400/image.height,1);
          const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);
          canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL('image/jpeg',0.82));
        }catch(error){reject(error);}
      };image.src=reader.result;
    };reader.readAsDataURL(file);
  });
}
let photoQueue=Promise.resolve();
function addImg(event){
  const files=Array.from(event.target.files);event.target.value='';
  photoQueue=photoQueue.then(async()=>{
    if(imgs.length+files.length>10){setError('사진은 최대 10장입니다. 현재 사진은 유지됩니다.');return;}
    for(const file of files){
      try{
        const src=await compress(file);const bytes=s=>Math.floor(s.split(',')[1].length*3/4);
        if(bytes(src)>2*1024*1024||imgs.reduce((n,s)=>n+bytes(s),0)+bytes(src)>6*1024*1024)throw new Error('압축 사진은 장당 2MiB, 합계 6MiB 이하이어야 합니다.');
        imgs.push(src);
        const wrapper=document.createElement('div');wrapper.className='pi';
        const image=document.createElement('img');image.src=src;
        const number=document.createElement('div');number.className='pi-n';
        const remove=document.createElement('button');remove.className='db';remove.textContent='✕';
        remove.onclick=()=>{const index=[...g('pg').children].indexOf(wrapper);imgs.splice(index,1);wrapper.remove();reNumber();};
        wrapper.append(image,number,remove);g('pg').append(wrapper);reNumber();await persistDraft();
        g('cnote').textContent='✅ 사진 압축 완료 · 이번 화면에서만 임시 보관';g('cnote').className='cn on';
      }catch(error){setError(error.message);}
    }
  });
}
function reNumber(){
  queueDraft();
  var items=g('pg').querySelectorAll('.pi');
  items.forEach(function(el,i){el.querySelector('.pi-n').textContent=(i+1);});
  g('pcnt').textContent=imgs.length>0?'총 '+imgs.length+'장 업로드됨 (AI가 사진 분석 후 적절한 위치에 배치)':'';
}

/* 로딩 */
function anim(){
  var ss=[{i:'ls1',l:'📊 제목 분석 중...',p:15},{i:'ls2',l:'🔍 키워드 추출 중...',p:30},{i:'ls3',l:'✍️ 본문 작성 중...',p:60},{i:'ls4',l:'🎯 SEO 최적화 중...',p:88},{i:'ls5',l:'✅ 완성!',p:100}];
  var k=0;function tk(){if(k>=ss.length)return;g('lst').textContent=ss[k].l;g('lb').style.width=ss[k].p+'%';k++;setTimeout(tk,1200);}tk();
}

async function gen(){
  if(!auth.currentUser){openSettings();setError('로그인 후 사용할 수 있습니다.');return;}
  if(!auth.currentUser.emailVerified){openSettings();setError('이메일 인증을 완료해주세요.');return;}
  var t=g('ti').value.trim(),c=g('ci').value.trim();
  if(!t||!sT||!c||!sV){setError('⚠️ 제목, 글 유형, 내용, 분량을 모두 입력/선택해주세요!');return;}
  g('gb').disabled=true;
  try {
    await photoQueue;await persistDraft();
    await generationUI.submit({title:t,memo:g('mi').value,content:c,placeInfo:g('ii').value,type:sT,volume:sV},imgs);
  } catch(error){setError(error.message);}
  finally {g('gb').disabled=generationUI.busy();}
}

function nl(s){return (s||'').replace(/\\n/g,'\n');}
function recover(raw,ft){
  function pk(k){var re=new RegExp('"'+k+'"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"');var m=raw.match(re);return m?m[1]:'';}
  function pa(k){var re=new RegExp('"'+k+'"\\s*:\\s*\\[([\\s\\S]*?)\\]');var m=raw.match(re);if(!m)return[];var it=m[1].match(/"((?:[^"\\]|\\.)*)"/g);return it?it.map(function(s){return s.replace(/^"|"$/g,'');}):[];}
  var o={title_1:pk('title_1')||ft,title_2:pk('title_2'),title_3:pk('title_3'),keyword_main:pk('keyword_main')||'-',keyword_sub:pk('keyword_sub')||'-',keyword_location:pk('keyword_location')||'-',keyword_intent:pk('keyword_intent')||'-',place_name:pk('place_name'),place_address:pk('place_address'),place_hours:pk('place_hours'),place_price:pk('place_price'),body:pk('body'),hashtags:pa('hashtags'),reel:pk('reel'),thumbnail:pk('thumbnail')};
  if(!o.body){var cl=raw.replace(/^[\s\S]*?"body"\s*:\s*"/,'').replace(/",\s*"hashtags"[\s\S]*$/,'');o.body=cl||raw;}return o;
}

function show(d,naver){
  g('rb6').className='rb';
  g('load').className='load';
  var tcs=g('tcs');tcs.innerHTML='';
  [d.title_1,d.title_2,d.title_3].forEach(function(ti,ix){
    if(!ti)return;var c=document.createElement('div');c.className='tc';
    var n=document.createElement('div');n.className='tc-n';n.textContent=(ix+1);
    var x=document.createElement('div');x.className='tc-x';x.textContent=ti;
    var b=document.createElement('button');b.className='tc-c';b.textContent='복사';
    (function(t2,b2){b2.onclick=function(){cpTxt(t2);b2.textContent='✅';b2.classList.add('ok');setTimeout(function(){b2.textContent='복사';b2.classList.remove('ok');},2000);};})(ti,b);
    c.appendChild(n);c.appendChild(x);c.appendChild(b);tcs.appendChild(c);});
  g('rb1').className='rb on';
  var kg=g('kg');kg.innerHTML='';
  [['메인 키워드',d.keyword_main],['서브 키워드',d.keyword_sub],['지역 키워드',d.keyword_location],['검색 의도',d.keyword_intent]].forEach(function(p){
    var c=document.createElement('div');c.className='kc';var l=document.createElement('div');l.className='kl';l.textContent=p[0];
    var v=document.createElement('div');v.className='kv';v.textContent=p[1]||'-';c.appendChild(l);c.appendChild(v);kg.appendChild(c);});
  g('rb2').className='rb on';

  /* 위치 정보 + 네이버 지도 */
  var pn=escapeHtml(d.place_name||''), pa=escapeHtml(d.place_address||''), ph=escapeHtml(d.place_hours||''), pp=escapeHtml(d.place_price||'');
  if(pn||pa){
    var piHtml='<div style="display:flex;flex-direction:column;gap:8px">';
    if(pn) piHtml+='<div class="kc"><div class="kl">업체명</div><div class="kv" style="font-size:14px">'+pn+'</div></div>';
    if(pa) piHtml+='<div class="kc"><div class="kl">주소</div><div class="kv">'+pa+'</div></div>';
    if(ph) piHtml+='<div class="kc"><div class="kl">영업시간</div><div class="kv">'+ph+'</div></div>';
    if(pp) piHtml+='<div class="kc"><div class="kl">가격대</div><div class="kv">'+pp+'</div></div>';
    piHtml+='</div>';
    g('placeInfo').innerHTML=piHtml;
    var mapQuery=encodeURIComponent(pn+(pa?' '+pa:''));
    var mapLink=g('naverMapLink');
    mapLink.href='https://map.naver.com/v5/search/'+mapQuery;
    mapLink.style.display='block';
    g('rb6').className='rb on';
  }

  var bs=nl(d.body||'');g('btxt').textContent=bs;g('cc').textContent=bs.replace(/\s/g,'').length.toLocaleString()+'자';g('rb3').className='rb on';
  var tw=g('tw');tw.innerHTML='';var ht=d.hashtags||[];
  if(!ht.length){var mm=(d.body||'').match(/#[가-힣a-zA-Z0-9_]+/g);if(mm)ht=mm.slice(0,15);}
  ht.forEach(function(t){var s=document.createElement('span');s.className='tag';s.textContent=t;s.onclick=function(){cpTxt(t);};tw.appendChild(s);});
  g('rb4').className='rb on';
  g('rt').textContent=nl(d.reel||'');g('th').textContent=nl(d.thumbnail||'');g('rb5').className='rb on';
  g('gb').disabled=false;
  g('empty').style.display='none';
  g('rightResult').scrollTop=0;
  /* 사진이 있으면 미리보기 탭 하이라이트 */
  if(imgs.length>0) g('tabPreview').style.color='#2d6a4f';
}

/* ── 사진 미리보기 렌더링 ── */
function renderPreview(){
  var area=g('previewArea');
  if(!resultData){
    area.innerHTML='<div class="preview-no"><div class="preview-no-ico">👀</div><div class="preview-no-txt">포스팅을 먼저 생성하면<br>사진이 합쳐진 미리보기를 볼 수 있어요</div></div>';
    return;
  }
  var d=resultData;
  var title=d.title_1||g('ti').value||'제목 없음';
  var bodyRaw=nl(d.body||'');
  var tags=(d.hashtags||[]).join(' ');

  /* [사진1] [사진2] 등을 찾아서 이미지로 교체 */
  var parts=bodyRaw.split(/(\[사진\d*\])/g);
  var imgIdx=0;
  var bodyHtml='';
  parts.forEach(function(part){
    var m=part.match(/\[사진(\d*)\]/);
    if(m){
      var idx=m[1]?parseInt(m[1])-1:imgIdx;
      if(imgs[idx]){
        bodyHtml+='<div class="pp-img"><img src="'+safeImage(imgs[idx])+'" alt="사진'+(idx+1)+'"></div>';
      } else {
        bodyHtml+='<div class="pp-img-empty"><div class="pp-img-empty-ico">📸</div><div class="pp-img-empty-txt">사진'+(idx+1)+' — 왼쪽에서 사진을 업로드하세요</div></div>';
      }
      imgIdx++;
    } else {
      /* 일반 텍스트 — 줄바꿈 유지 */
      var escaped=part.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      bodyHtml+='<p>'+escaped+'</p>';
    }
  });

  /* [사진N] 마커가 없는데 이미지가 있으면 맨 아래에 배치 */
  if(imgIdx===0&&imgs.length>0){
    bodyHtml+='<div style="margin-top:20px">';
    imgs.forEach(function(src,i){
      bodyHtml+='<div class="pp-img"><img src="'+safeImage(src)+'" alt="사진'+(i+1)+'"></div>';
    });
    bodyHtml+='</div>';
  }

  var tagsHtml='';
  if(tags){
    tagsHtml='<div class="preview-post-tags">';
    tags.split(/\s+/).forEach(function(t){if(t.startsWith('#'))tagsHtml+='<span>'+escapeHtml(t)+'</span> ';});
    tagsHtml+='</div>';
  }

  area.innerHTML='<div class="preview-wrap"><div class="preview-post">'
    +'<div class="preview-post-title">'+escapeHtml(title)+'</div>'
    +'<div class="preview-post-body">'+bodyHtml+'</div>'
    +tagsHtml
    +'</div></div>';
}

/* ── 복사 ── */
function cpTxt(t){if(navigator.clipboard)navigator.clipboard.writeText(t).catch(function(){fb(t);});else fb(t);}
function fb(t){var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');document.body.removeChild(a);}
function cpId(id,b){var o=b.textContent;cpTxt(g(id).textContent);b.textContent='✅ 복사됨!';b.classList.add('ok');setTimeout(function(){b.textContent=o;b.classList.remove('ok');},2000);}
function cpTags(b){var t=Array.from(document.querySelectorAll('.tag')).map(function(x){return x.textContent;}).join(' ');var o=b.textContent;cpTxt(t);b.textContent='✅ 복사됨!';b.classList.add('ok');setTimeout(function(){b.textContent=o;b.classList.remove('ok');},2000);}
function cpAll(){
  var ti=Array.from(document.querySelectorAll('.tc-x')).map(function(e,i){return(i+1)+'. '+e.textContent;}).join('\n');
  cpTxt('[제목]\n'+ti+'\n\n[본문]\n'+g('btxt').textContent+'\n\n[해시태그]\n'+Array.from(document.querySelectorAll('.tag')).map(function(x){return x.textContent;}).join(' ')+'\n\n[릴스]\n'+g('rt').textContent+'\n\n[썸네일]\n'+g('th').textContent);
  alert('전체 복사 완료! ✅');
}
function clearStudio(){
  ['ti','mi','ci','ii'].forEach(function(id){g(id).value='';});g('pg').innerHTML='';g('pcnt').textContent='';g('cnote').className='cn';
  document.querySelectorAll('.tb').forEach(function(b){b.classList.remove('on');});
  document.querySelectorAll('.vb').forEach(function(b){b.classList.remove('on');});
  sT='';sV='';imgs=[];resultData=null;currentStyle=null;
  ['rb1','rb2','rb3','rb4','rb5','rb6'].forEach(function(id){g(id).className='rb';});
  g('load').className='load';g('eb').className='err';g('gb').disabled=false;g('empty').style.display='';
  g('rightResult').scrollTop=0;switchTab('result');queueDraft();
}

function snapshot(){
  return {schemaVersion:3,form:Object.fromEntries(['ti','mi','ci','ii'].map(id=>[id,g(id).value])),
    style:currentStyle,type:sT, volume:sV, imgs:[...imgs], data:resultData, updatedAt:new Date().toISOString()};
}
async function persistDraft(){if(draftReady)await putDraft(snapshot());}
function queueDraft(){if(draftReady)void persistDraft().catch(e=>setError('기기 자동 저장 실패: '+e.message+' · JSON 백업을 확인하세요.'));}
function applySnapshot(post){
  currentStyle=post.style||null;
  const state=post.form || {};
  for(const id of ['ti','mi','ci','ii'])g(id).value=state[id] || '';
  sT=post.type || '';sV=post.volume || '';imgs=(post.imgs || []).filter(src=>safeImage(src));resultData=post.data || null;
  document.querySelectorAll('.tb').forEach(b=>b.classList.toggle('on', b.textContent.trim()===sT));
  const volumes=['short','normal','long'];
  document.querySelectorAll('.vb').forEach((b,i)=>b.classList.toggle('on',volumes[i]===sV));
  g('pg').replaceChildren();
  imgs.forEach((src,index)=>{
    const wrapper=document.createElement('div');wrapper.className='pi';
    const image=document.createElement('img');image.src=src;
    const number=document.createElement('div');number.className='pi-n';number.textContent=index+1;
    const remove=document.createElement('button');remove.className='db';remove.textContent='✕';
    remove.onclick=()=>{const ix=[...g('pg').children].indexOf(wrapper);imgs.splice(ix,1);wrapper.remove();reNumber();};
    wrapper.append(image,number,remove);g('pg').append(wrapper);
  });
  reNumber();
  ['rb1','rb2','rb3','rb4','rb5','rb6'].forEach(id=>g(id).className='rb');
  g('empty').style.display=resultData?'none':'';
  if(resultData)show(resultData,null);
}
async function updateSavedCount(){const posts=await localPosts();g('savedCount').textContent=posts.length+cloudPosts.length || '';}
async function savePost(){
  if(!resultData){alert('저장할 글이 없어요!');return;}
  try{
    await photoQueue;const state=snapshot();
    await putLocalPost({...state,id:crypto.randomUUID(),title:resultData.title_1||g('ti').value||'제목 없음',date:new Date().toLocaleString('ko-KR')});
    await updateSavedCount();
    const b=g('saveBtn');b.textContent='✅ 기기에 저장됨';setTimeout(()=>b.textContent='💾 저장',2000);
  }catch(error){setError('저장 실패: '+error.message);}
}
function action(label,callback){
  const button=document.createElement('button');button.className='ab';button.textContent=label;
  button.onclick=async()=>{button.disabled=true;try{await callback();}catch(e){setError(e.message);}finally{button.disabled=false;}};
  return button;
}
function postCard(post,cloud=false){
  const card=document.createElement('div');card.style.cssText='background:#fff;border:1px solid #e4e1dc;border-radius:12px;padding:16px;margin-bottom:10px';
  const title=document.createElement('div');title.style.cssText='font-size:14px;font-weight:700;margin-bottom:8px';title.textContent=post.title;
  const meta=document.createElement('div');meta.className='hint';meta.textContent=`${cloud?'내 계정':'이 기기'} · ${post.date || ''} · ${post.type || ''}`;
  const body=document.createElement('div');body.className='modal-d';body.textContent=nl(post.data?.body || '').slice(0,150)+'…';
  const buttons=document.createElement('div');buttons.className='ar';
  buttons.append(action('📄 불러오기',async()=>{
    const epoch=accountEpoch;
    if(!confirm('현재 작업을 텍스트로 백업하고 글을 불러올까요? 사진은 재첨부해야 합니다.'))return;
    const loaded=cloud?await loadCloudPost(post.id):post;
    if(cloud && epoch!==accountEpoch)throw new Error('계정이 변경되었습니다. 다시 선택하세요.');
    await photoQueue;
    // Persist the existing working copy before replacing it with another post.
    await putLocalPost({...snapshot(),id:crypto.randomUUID(),title:'작성 중 자동 백업',date:new Date().toLocaleString('ko-KR')});
    applySnapshot(loaded);await persistDraft();switchTab('result');await updateSavedCount();
  }),action('📋 복사',()=>cpTxt(`[제목]\n${post.title}\n\n[본문]\n${nl(post.data?.body||'')}\n\n[해시태그]\n${(post.data?.hashtags||[]).join(' ')}`)));
  if(cloud){
    buttons.append(action('✏️ 현재 내용으로 계정 글 수정',async()=>{if(!resultData)throw new Error('수정할 결과를 먼저 불러오세요.');await saveCloudPost({id:post.id,expectedVersion:post.version,requestId:crypto.randomUUID(),post:{...snapshot(),title:resultData.title_1||post.title}});} ),action('🗑️ 계정 글 삭제',async()=>{if(confirm('계정의 이 글을 삭제할까요?')){await deleteCloudPost({id:post.id,requestId:crypto.randomUUID()});const uid=auth.currentUser?.uid;for(const p of await localPosts())if(p.cloudLinks?.[uid]?.id===post.id){const links={...p.cloudLinks};delete links[uid];await putLocalPost({...p,cloudLinks:links});}await renderSavedList();}}));
  }
  if(!cloud){
    buttons.append(action('☁️ 내 계정에 복사',async()=>{
      const uid=auth.currentUser?.uid;
      if(!uid){openSettings();throw new Error('로그인이 필요합니다.');}
      if(!confirm('이 기기에 보관된 글과 사진을 현재 로그인한 내 계정에 복사할까요?'))return;
      const link=post.cloudLinks?.[uid] || {id:crypto.randomUUID(),version:0};
      const saved=await saveCloudPost({id:link.id,expectedVersion:link.version,requestId:crypto.randomUUID(),post:{...post,data:{...post.data,hashtags:post.data?.hashtags||[]}}});
      await putLocalPost({...post,cloudLinks:{...post.cloudLinks,[uid]:saved}});
      await renderSavedList();
    }),action('🗑️',async()=>{if(confirm('기기 보관함에서 이 글을 삭제할까요? 기존 v3 원본 백업은 유지됩니다.')){await deleteLocalPost(post.id);await renderSavedList();await updateSavedCount();}}));
  }
  card.append(title,meta,body,buttons);return card;
}
async function renderSavedList(){
  try{
    const posts=(await localPosts()).reverse();g('savedList').replaceChildren(...posts.map(p=>postCard(p)));
    if(posts.length){
      const clear=action('🗑️ 기기 보관함 전체 삭제',async()=>{
        if(!confirm('이 기기의 글 '+posts.length+'개를 삭제할까요? 먼저 JSON 백업을 권장합니다. 계정 글과 v3 원본 백업은 유지됩니다.'))return;
        for(const post of posts)await deleteLocalPost(post.id);
        await renderSavedList();await updateSavedCount();
      });g('savedList').prepend(clear);
    }
    g('savedEmpty').style.display=posts.length||cloudPosts.length?'none':'block';
    renderCloudPosts();
  }catch(e){setError(e.message);}
}
function renderCloudPosts(){g('cloudSavedList').replaceChildren(...cloudPosts.map(p=>postCard(p,true)));}
Object.assign(window,{st,sv,addImg,switchTab,gen,cpId,cpTags,cpAll,reset,savePost,openSettings,closeModal});
for(const id of ['ti','mi','ci','ii'])g(id).addEventListener('input',queueDraft);
g('backupBtn').onclick=()=>exportBackup().catch(e=>setError(e.message));
g('importBtn').onclick=()=>g('backupFile').click();
g('backupFile').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  if(!confirm('JSON의 텍스트와 사진 위치만 복원합니다. 실제 사진과 회원 정보는 복원하지 않습니다. 현재 작업은 유지됩니다. 계속할까요?'))return;
  try{const count=await importBackup(await file.text());await renderSavedList();await updateSavedCount();alert(count+'개를 기기 보관함에 복원했습니다. 현재 작성 중 데이터는 유지됩니다.');}
  catch(e){setError('가져오기 실패: '+e.message);}
  finally{event.target.value='';}
};
// Remove only obsolete API credentials; preserve posts, photos and all unrelated keys.
for(const key of ['jaeinit_claude_key','jaeinit_naver_id','jaeinit_naver_sec'])localStorage.removeItem(key);
generationUI=initGenerationUI({onError:setError,onResult:async full=>{
  await photoQueue;
  if(auth.currentUser?.uid!==full.uid)return;
  if(resultData||imgs.length||['ti','mi','ci','ii'].some(id=>g(id).value))await putLocalPost({...snapshot(),id:crypto.randomUUID(),title:'생성 전 작성 내용 자동 백업',date:new Date().toLocaleString('ko-KR')});
  applySnapshot({form:{ti:full.input.title,mi:full.input.memo,ci:full.input.content,ii:full.input.placeInfo},type:full.input.type,volume:full.input.volume,imgs:full.imgs,style:full.style,data:full.result});
  await persistDraft();
  await putLocalPost({...snapshot(),id:'generation_'+full.id,title:full.result.title_1,date:new Date().toLocaleString('ko-KR')});
  await updateSavedCount();switchTab('result');
}});
g('editBodyBtn').onclick=()=>{
 const editing=g('btxt').contentEditable==='true';g('btxt').contentEditable=editing?'false':'true';
 if(!editing)g('btxt').focus();else if(resultData){resultData.body=g('btxt').textContent;queueDraft();}
};
g('btxt').addEventListener('blur',()=>{if(resultData&&g('btxt').contentEditable==='true'){resultData.body=g('btxt').textContent;queueDraft();}});
initAccount({
  onProfile(profile,policy){generationUI.profile(profile);updateStyleProfile(profile);g('signupPolicy').textContent=`이메일 인증 후 최초 무료 AI ${policy.signupCredits}회 · 월 추가 지급 없음 · 크레딧 충전 준비 중`;g('memberPolicy').textContent=`${profile?.tier||'FREE'} · 글 ${profile?.savedPostCount||0}/${profile?.tier==='PRO'?'무제한':policy.freePostLimit} · JSON ${profile?.exportsUsed||0}/${profile?.tier==='PRO'?'무제한':policy.freeExportLimit}`;},
  onSession(uid){g('morePostsBtn').disabled=false;g('memberPolicy').textContent='회원 정책 확인 중';generationUI.session(uid);accountEpoch++;cloudPosts=[];renderCloudPosts();void updateSavedCount().catch(e=>setError(e.message));},
  onPosts(posts){const first=new Set(posts.map(p=>p.id));cloudPosts=[...posts,...cloudPosts.slice(20).filter(p=>!first.has(p.id))];renderCloudPosts();void updateSavedCount().catch(e=>setError(e.message));}
});
async function initializeLocal(){
  try{await migrateLegacy();}catch(e){setError(e.message);}
  try{const draft=await getDraft();if(draft)applySnapshot(draft);await updateSavedCount();draftReady=true;}
  catch(e){setError('기기 보관함을 사용할 수 없습니다: '+e.message);}
}
void initializeLocal();

async function reset(){
  try{
    await photoQueue;
    if(resultData || imgs.length || ['ti','mi','ci','ii'].some(id=>g(id).value)){
      await putLocalPost({...snapshot(),id:crypto.randomUUID(),title:'새로 작성 전 자동 백업',date:new Date().toLocaleString('ko-KR')});
    }
    clearStudio();await persistDraft();await updateSavedCount();
  }catch(e){setError('원본 보관에 실패하여 새로 작성을 취소했습니다: '+e.message);}
}

g('closeProBtn').onclick=()=>g('proModal').className='modal hide';
g('morePostsBtn').onclick=async()=>{
 try{const data=await listCloudPosts({cursor:cloudPosts.at(-1)?.id||null});const existing=new Set(cloudPosts.map(p=>p.id));cloudPosts.push(...data.posts.filter(p=>!existing.has(p.id)));renderCloudPosts();g('morePostsBtn').disabled=!data.nextCursor;}catch(e){setError(e.message);}
};
