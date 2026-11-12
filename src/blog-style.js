import {updateBlogStyle,getBlogStyles,selectBlogStyle,deleteBlogStyle} from './api.js';
const el=id=>document.getElementById(id);
const preset={blogName:'잰잇',greeting:'안녕하세요! 여행블로거 잰잇입니다 ^ㅎ^',closing:'오늘 포스팅이 도움 되셨다면 공감이랑 서이추 꾸욱 눌러주세요!\n다음에 더 알찬 여행 정보로 돌아올게요 💖',tone:'friendly',emoji:true,instructions:'',preset:'jaeinit'};
export function initBlogStyle(){
 let saved={...preset},styles=[],id='default';
 async function refresh(){const data=await getBlogStyles();styles=data.styles;el('styleList').replaceChildren(...styles.map(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.blogName||s.id;return o;}));id=data.activeStyleId;el('styleList').value=id;fill(styles.find(s=>s.id===id)||preset);}
 el('styleList').onchange=()=>{id=el('styleList').value;fill(styles.find(s=>s.id===id)||preset);};
 el('newStyleBtn').onclick=()=>{id=crypto.randomUUID();fill({...preset,preset:'custom',blogName:''});};
 el('selectStyleBtn').onclick=async()=>{try{await selectBlogStyle(id);el('styleStatus').textContent='생성 스타일을 선택했습니다.';}catch(e){el('styleStatus').textContent=e.message;if(e.code==='functions/resource-exhausted')el('proModal').className='modal';}};
 el('deleteStyleBtn').onclick=async()=>{try{await deleteBlogStyle(id);await refresh();}catch(e){el('styleStatus').textContent=e.message;if(e.code==='functions/resource-exhausted')el('proModal').className='modal';}};
 function fill(style){for(const [key,id] of Object.entries({blogName:'styleName',greeting:'styleGreeting',closing:'styleClosing',tone:'styleTone',instructions:'styleInstructions',preset:'stylePreset'}))el(id).value=style[key]??'';el('styleEmoji').checked=style.emoji??true;}
 el('styleBtn').onclick=()=>{fill(saved);el('styleModal').className='modal';void refresh().catch(e=>el('styleStatus').textContent=e.message);};
 el('closeStyleBtn').onclick=()=>el('styleModal').className='modal hide';
 el('stylePreset').onchange=()=>{if(el('stylePreset').value==='jaeinit')fill(preset);};
 el('styleForm').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;
  try{
   const value={};for(const [key,id] of Object.entries({blogName:'styleName',greeting:'styleGreeting',closing:'styleClosing',tone:'styleTone',instructions:'styleInstructions',preset:'stylePreset'}))value[key]=el(id).value;
   value.emoji=el('styleEmoji').checked;saved=await updateBlogStyle({id,style:value});await refresh();el('styleStatus').textContent='계정에 저장했습니다. 다음 생성부터 적용됩니다.';
  }catch(e){el('styleStatus').textContent=e.message;if(e.code==='functions/resource-exhausted')el('proModal').className='modal';}finally{button.disabled=false;}
 };
 return profile=>{saved=profile?.blogStyle||{...preset};};
}
