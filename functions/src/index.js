import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { provisionProfile } from './profile.js';
import { saveOwnedPost, loadOwnedPost } from './posts.js';
initializeApp();
const db = getFirestore();
const identityKey = defineSecret('SIGNUP_IDENTITY_HMAC_KEY');
const options = { region: 'asia-northeast3', maxInstances: 10 };
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
  if (!(await db.doc(`users/${user.uid}`).get()).exists) throw new HttpsError('failed-precondition','회원 초기화를 완료해주세요.');
  return user;
}
export const ensureProfile = onCall({...options, secrets: [identityKey]}, async request => {
  const user = await verifiedIdentity(request);
  return provisionProfile(db, user, identityKey.value());
});
export const savePost = onCall(options, async request => {
  const user = await member(request);
  return saveOwnedPost(db, user.uid, request.data);
});
export const getPost = onCall(options, async request => {
  const user = await member(request);
  return loadOwnedPost(db, user.uid, request.data?.id);
});
// Explicitly closed interfaces for STEP 2. They do not call providers, write orders,
// debit credits, or return fake generated text / successful payment statuses.
export const requestGeneration = onCall(options, async request => {
  await member(request);
  throw new HttpsError('unimplemented','AI 생성은 STEP 2에서 연결됩니다. 크레딧은 차감되지 않았습니다.');
});
export const createOrder = onCall(options, async request => {
  await member(request);
  throw new HttpsError('unimplemented','일회성 결제는 STEP 2에서 연결됩니다.');
});
export const confirmPayment = onCall(options, async request => {
  await member(request);
  throw new HttpsError('unimplemented','결제 승인은 STEP 2에서 연결됩니다.');
});
