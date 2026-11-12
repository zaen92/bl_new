import { auth, emulatorMode } from './firebase.js';
import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut, onAuthStateChanged, reload } from 'firebase/auth';
import { ensureProfile, watchMember } from './api.js';
const el = id => document.getElementById(id);
export function initAccount({onPosts, onSession,onProfile=()=>{}}) {
  let stop = () => {}, epoch = 0;
  const message = value => {el('authMessage').textContent=value;};
  const attempt = action => async event => {
    event?.preventDefault();
    const buttons = [...el('modal').querySelectorAll('button')];
    buttons.forEach(b=>b.disabled=true);
    try { await action(); } catch(e) { message(e.message); }
    finally { buttons.forEach(b=>b.disabled=false); }
  };
  async function sync() {
    const user = auth.currentUser;
    const current = ++epoch;
    stop(); stop=()=>{}; onPosts([]); onSession(user?.uid ?? null);
    el('authForm').hidden=!!user;
    el('memberActions').hidden=!user;
    el('stx').textContent=user?'👤 내 계정':'👤 로그인';
    el('dot').className='hd-dot';
    el('stxStatus').textContent=user?'회원 확인 중':'로그인 필요';
    el('accountProfile').textContent=user?`${user.displayName || ''} ${user.email}`:'';
    if(!user){message(emulatorMode?'로컬 Emulator 모드입니다. 실제 과금은 없습니다.':'로그인해주세요.');return;}
    el('verifyBtn').hidden=user.emailVerified;
    if(!user.emailVerified){message('이메일 인증을 완료하고 인증 확인을 누르세요. 아직 크레딧은 지급되지 않았습니다.');el('stxStatus').textContent='이메일 인증 필요';return;}
    try {
      await ensureProfile();
      if(current!==epoch || auth.currentUser?.uid!==user.uid)return;
      stop=watchMember(user.uid, profile=>{
        if(current!==epoch)return;
        el('dot').className='hd-dot on';
        el('stxStatus').textContent=`크레딧 ${profile?.credits ?? 0}개`;onProfile(profile);
        message(`로그인되었습니다. 크레딧 ${profile?.credits ?? 0}개 · 새 AI 생성 1회당 1크레딧입니다.`);
      }, posts=>{if(current===epoch)onPosts(posts);}, error=>message(error.message));
    }catch(error){if(current===epoch){message(error.message);el('stxStatus').textContent='회원 초기화 재시도 필요';}}
  }
  el('authForm').onsubmit=attempt(async()=>{
    await signInWithEmailAndPassword(auth,el('email').value.trim(),el('password').value);
    el('password').value='';
  });
  el('signupBtn').onclick=attempt(async()=>{
    if(!el('authForm').reportValidity())return;
    const {user}=await createUserWithEmailAndPassword(auth,el('email').value.trim(),el('password').value);
    el('password').value=''; await sendEmailVerification(user);
    message('인증 메일을 보냈습니다. 메일에서 인증한 후 인증 확인을 누르세요. 로컬 인증 링크는 Emulator 로그에서 확인합니다.');
  });
  el('googleBtn').onclick=attempt(()=>signInWithPopup(auth,new GoogleAuthProvider()));
  el('verifyBtn').onclick=attempt(async()=>{await sendEmailVerification(auth.currentUser);message('인증 메일을 보냈습니다.');});
  el('refreshMemberBtn').onclick=attempt(async()=>{await reload(auth.currentUser);await auth.currentUser.getIdToken(true);await sync();});
  el('logoutBtn').onclick=attempt(()=>signOut(auth));
  el('resetPasswordBtn').onclick=attempt(async()=>{await sendPasswordResetEmail(auth,el('email').value.trim());message('비밀번호 재설정 메일을 요청했습니다.');});
  onAuthStateChanged(auth,()=>void sync());
}
