import {HttpsError} from 'firebase-functions/v2/https';
export const DEFAULT_POLICY=Object.freeze({signupCredits:5,freePostLimit:5,freeExportLimit:5,freeStyleLimit:1,proStyleLimit:50});
export function validatePolicy(value={}){
 const result={...DEFAULT_POLICY};
 for(const [key,n] of Object.entries(value)){
  if(!(key in result)||!Number.isSafeInteger(n)||n<0||n>10000)throw new HttpsError('invalid-argument','서비스 정책 형식 오류');
  result[key]=n;
 }
 return result;
}
export const policyFrom=s=>validatePolicy(s?.exists?s.data():{});
export const tierOf=u=>u.tier==='PRO'?'PRO':'FREE';
export const limitError=feature=>new HttpsError('resource-exhausted','FREE 기능 한도입니다. PRO 전환 및 크레딧 결제는 준비 중입니다.',{feature});
export function plainText(value,max){
 if(typeof value!=='string'||value.length>max||/data:image|blob:|iVBORw0KGgo[A-Za-z0-9+/]{50}|\/9j\/[A-Za-z0-9+/]{100}/i.test(value))throw new HttpsError('invalid-argument','사진 데이터 없이 텍스트만 저장할 수 있습니다.');
 return value;
}
