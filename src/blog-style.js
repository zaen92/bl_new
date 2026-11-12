import {updateBlogStyle} from './api.js';
const el=id=>document.getElementById(id);
const preset={blogName:'잰잇',greeting:'안녕하세요! 여행블로거 잰잇입니다 ^ㅎ^',closing:'오늘 포스팅이 도움 되셨다면 공감이랑 서이추 꾸욱 눌러주세요!\n다음에 더 알찬 여행 정보로 돌아올게요 💖',tone:'friendly',emoji:true,instructions:'',preset:'jaeinit'};
export function initBlogStyle(){
 let saved={...preset};
 function fill(style){for(const [key,id] of Object.entries({blogName:'styleName',greeting:'styleGreeting',closing:'styleClosing',tone:'styleTone',instructions:'styleInstructions',preset:'stylePreset'}))el(id).value=style[key]??'';el('styleEmoji').checked=style.emoji??true;}
 el('styleBtn').onclick=()=>{fill(saved);el('styleModal').className='modal';};
 el('closeStyleBtn').onclick=()=>el('styleModal').className='modal hide';
 el('stylePreset').onchange=()=>{if(el('stylePreset').value==='jaeinit')fill(preset);};
 el('styleForm').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;
  try{
   const value={};for(const [key,id] of Object.entries({blogName:'styleName',greeting:'styleGreeting',closing:'styleClosing',tone:'styleTone',instructions:'styleInstructions',preset:'stylePreset'}))value[key]=el(id).value;
   value.emoji=el('styleEmoji').checked;saved=await updateBlogStyle(value);el('styleStatus').textContent='계정에 저장했습니다. 다음 생성부터 적용됩니다.';
  }catch(e){el('styleStatus').textContent=e.message;}finally{button.disabled=false;}
 };
 return profile=>{saved=profile?.blogStyle||{...preset};};
}
