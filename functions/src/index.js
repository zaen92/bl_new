import { initializeApp, getAuth, getFirestore } from './admin.js';
import { defineSecret,defineString } from 'firebase-functions/params';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import * as functionsV1 from 'firebase-functions/v1';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { provisionProfile } from './profile.js';
import { saveOwnedPost,loadOwnedPost,deleteOwnedPost,listOwnedPosts } from './posts.js';
import {reserveGeneration,runGeneration,recoverExpired,saveBlogStyle,validateInput} from './generations.js';
import {decodePhotos} from './photos.js';
import {configFrom} from './ai-config.js';
import {approveExport,listStyles,selectStyle,deleteStyle} from './member-features.js';
import {policyFrom,validatePolicy} from './service-policy.js';
import {anthropicProvider,mockProvider} from './ai-provider.js';
import {validateAIConfig} from './ai-config.js';
import {appCheckEnabled} from './runtime-config.js';
initializeApp();
const db = getFirestore();
const identityKey = defineSecret('SIGNUP_IDENTITY_HMAC_KEY');
const appCheck=appCheckEnabled();
const providerMode=defineString('AI_PROVIDER_MODE',{default:'disabled'});
const claudeKey=defineSecret('CLAUDE_API_KEY'),naverId=defineSecret('NAVER_CLIENT_ID'),naverSecret=defineSecret('NAVER_CLIENT_SECRET');
const options = { region: 'asia-northeast3', maxInstances: 10,enforceAppCheck:appCheck };
function getProvider(){
 const mode=providerMode.value();
 if(mode==='mock' && process.env.FUNCTIONS_EMULATOR==='true')return mockProvider({delayMs:Number(process.env.AI_MOCK_DELAY_MS||0)});
 if(mode==='anthropic')return anthropicProvider({apiKey:claudeKey.value(),naverId:naverId.value(),naverSecret:naverSecret.value()});
 throw new HttpsError('failed-precondition','AI 서비스가 아직 설정되지 않았습니다.');
}
async function verifiedIdentity(request) {
  if (!request.auth) throw new HttpsError('unauthenticated','로그인이 필요합니다.');
  // Read authoritative Auth state, including disabled/deleted users and verified email.
  const user = await getAuth().getUser(request.auth.uid).catch(() => null);
  if (!user || user.disabled) throw new HttpsError('unauthenticated','유효하지 않은 계정입니다.');
  if (!user.emailVerified || !user.email) throw new HttpsError('failed-precondition','이메일 인증을 완료해주세요.');
  return user;
}
async function member(request) {
  const user = await verifiedIdentity(request);
  if ((await db.doc(`deletedUsers/${user.uid}`).get()).exists || !(await db.doc(`users/${user.uid}`).get()).exists) throw new HttpsError('failed-precondition','회원 초기화를 완료해주세요.');
  return user;
}
export const ensureProfile = onCall({...options, secrets: [identityKey]}, async request => {
  const user = await verifiedIdentity(request);
  return provisionProfile(db, user, identityKey.value());
});
export const savePost = onCall(options, async request => {
  const user = await member(request);
  const data=request.data;
  return saveOwnedPost(db,user.uid,data);
});
export const getPost = onCall(options, async request => {
  const user = await member(request);
  const post=await loadOwnedPost(db,user.uid,request.data?.id);
  return post;
});
export const requestGeneration = onCall({...options,timeoutSeconds:360,memory:'1GiB',secrets:[claudeKey,naverId,naverSecret]}, async (request,response) => {
  const user=await member(request);
  // validate/reserve before selecting a provider; disabled modes never enqueue.
  validateInput(request.data);
  const mode=providerMode.value();
  if(!['anthropic','mock'].includes(mode)||mode==='mock'&&process.env.FUNCTIONS_EMULATOR!=='true')throw new HttpsError('failed-precondition','AI 서비스가 아직 설정되지 않았습니다.');
  const provider=getProvider();
  const {photos}=decodePhotos(request.data.photos||[],configFrom(await db.doc('ops/ai').get()));
  const accepted=await reserveGeneration(db,user.uid,request.data);
  if(request.acceptsStreaming)await response.sendChunk({phase:'accepted',...accepted});
  delete request.data.photos;
  try{if(!accepted.duplicate)await runGeneration(db,accepted.generationId,{provider,photos});}
  finally{for(const photo of photos)photo.buffer.fill(0);}
  return accepted;
});
export const getGeneration=onCall(options,async request=>{
 const user=await member(request),id=request.data?.generationId;
 if(typeof id!=='string'||!/^([a-f0-9]{64})$/.test(id))throw new HttpsError('invalid-argument','생성 ID 오류');
 const g=await db.doc(`generations/${id}`).get();
 if(!g.exists||g.data().uid!==user.uid)throw new HttpsError('permission-denied','본인의 생성 결과만 조회할 수 있습니다.');
 const value={...g.data(),id};
 value.imgs=[];value.photosRequireAttachment=true;
 delete value.photoGroupId;
 return value;
});
export const updateBlogStyle=onCall(options,async request=>{
 const user=await member(request);return saveBlogStyle(db,user.uid,request.data||{});
});
async function operator(request){
 const user=await verifiedIdentity(request);if(user.customClaims?.admin!==true)throw new HttpsError('permission-denied','관리자 전용입니다.');return user;
}
export const updateAIConfig=onCall(options,async request=>{
 await operator(request);const c=validateAIConfig(request.data);await db.doc('ops/ai').set(c);return {updated:true};
});
export const recoverGenerations=onCall(options,async request=>{await operator(request);return recoverExpired(db);});
export const recoverySchedule=onSchedule({schedule:'every 5 minutes',region:'asia-northeast3',timeoutSeconds:300},async()=>{await recoverExpired(db);});
export const accountDeleted=functionsV1.region('asia-northeast3').auth.user().onDelete(async user=>{
 await db.doc(`deletedUsers/${user.uid}`).set({deletedAt:new Date()},{merge:true});
 // Existing photos are preserved for separately approved legacy migration/cleanup.
});
export const deletePost=onCall(options,async r=>deleteOwnedPost(db,(await member(r)).uid,r.data||{}));
export const listPosts=onCall(options,async r=>listOwnedPosts(db,(await member(r)).uid,r.data||{}));
export const approveJSONExport=onCall(options,async r=>approveExport(db,(await member(r)).uid,r.data||{}));
export const getServicePolicy=onCall(options,async r=>{await member(r);return policyFrom(await db.doc('ops/service').get());});
export const updateServicePolicy=onCall(options,async r=>{await operator(r);await db.doc('ops/service').set(validatePolicy(r.data));return {updated:true};});
export const getBlogStyles=onCall(options,async r=>listStyles(db,(await member(r)).uid));
export const selectBlogStyle=onCall(options,async r=>selectStyle(db,(await member(r)).uid,r.data||{}));
export const deleteBlogStyle=onCall(options,async r=>deleteStyle(db,(await member(r)).uid,r.data||{}));
// Payment interfaces remain closed for STEP 3.
export const createOrder = onCall(options, async request => {
  await member(request);
  throw new HttpsError('unimplemented','일회성 결제는 STEP 3에서 연결됩니다.');
});
export const confirmPayment = onCall(options, async request => {
  await member(request);
  throw new HttpsError('unimplemented','결제 승인은 STEP 3에서 연결됩니다.');
});
