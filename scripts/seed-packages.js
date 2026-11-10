import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
// Production requires explicit project, credentials and price review. No guessed prices.
if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Emulator 전용 seed입니다. 실제 상품은 관리자가 검토 후 등록하세요.');
initializeApp({projectId:'demo-jaeinit'});
const db=getFirestore();
for(const credits of [10,30,70]){
  await db.doc(`creditPackages/credits_${credits}`).set({credits,priceKRW:null,active:false});
}
console.log('10/30/70회 상품 초안을 비활성 상태로 저장했습니다. 가격은 미정입니다.');
