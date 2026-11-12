import {HttpsError} from 'firebase-functions/v2/https';
export const DEFAULT_AI_CONFIG=Object.freeze({
 enabled:true,model:'claude-sonnet-4-6',perMinute:3,perDay:20,concurrent:2,
 maxProviderRequests:3,maxInputTokens:48000,maxBillableInputTokens:1000000,maxOutputTokens:8192,maxSearches:3,timeoutMs:120000,
 dailyBudgetMicros:20000000,inputMicrosPerToken:3,outputMicrosPerToken:15,searchMicros:10000,
 maxPhotos:10,maxPhotoBytes:2097152,maxUploadBytes:6291456,storageQuotaBytes:200000000,retentionDays:90
});
export function validateAIConfig(value){
 const result={...DEFAULT_AI_CONFIG};
 if(!value || typeof value!=='object')throw new HttpsError('invalid-argument','운영 설정이 필요합니다.');
 for(const [key,v] of Object.entries(value)){
  if(!(key in result))throw new HttpsError('invalid-argument','알 수 없는 운영 설정입니다.');
  if(key==='enabled'){if(typeof v!=='boolean')throw new HttpsError('invalid-argument','enabled 형식 오류');}
  else if(key==='model'){if(typeof v!=='string'||!/^claude-[a-z0-9.-]{1,80}$/.test(v))throw new HttpsError('invalid-argument','모델 이름 오류');}
  else if(!Number.isSafeInteger(v)||v<0||v>1000000000)throw new HttpsError('invalid-argument','운영 제한은 정수여야 합니다.');
  result[key]=v;
 }
 if(result.maxProviderRequests<1||result.maxProviderRequests>3||result.maxBillableInputTokens<result.maxInputTokens||result.maxBillableInputTokens>2000000||result.inputMicrosPerToken<1||result.outputMicrosPerToken<1||result.concurrent<1||result.concurrent>10||result.timeoutMs<1000||result.timeoutMs>240000||result.maxPhotos>10||result.maxUploadBytes>6291456||result.maxPhotoBytes>2097152||result.maxOutputTokens<256||result.maxOutputTokens>16000||result.maxInputTokens<256||result.maxInputTokens>100000||result.maxSearches>10||result.retentionDays<1)throw new HttpsError('invalid-argument','지원하는 안전 제한 범위를 벗어났습니다.');
 return result;
}
export const configFrom=doc=>validateAIConfig(doc?.exists?doc.data():{});
export const maxCost=c=>c.maxBillableInputTokens*c.maxProviderRequests*c.inputMicrosPerToken+c.maxOutputTokens*c.outputMicrosPerToken+c.maxSearches*c.searchMicros;
export const usageCost=(c,u)=>Math.ceil((u.inputTokens||0)*c.inputMicrosPerToken+(u.outputTokens||0)*c.outputMicrosPerToken+(u.searches||0)*c.searchMicros);
export function buckets(user){
 const credits=user.credits;
 if(!Number.isSafeInteger(credits)||credits<0)throw new HttpsError('failed-precondition','잔액 확인이 필요합니다.');
 const free=Number.isSafeInteger(user.freeCredits)?user.freeCredits:Math.min(2,credits);
 const paid=Number.isSafeInteger(user.paidCredits)?user.paidCredits:credits-free;
 if(free<0||paid<0||free+paid!==credits)throw new HttpsError('failed-precondition','잔액 일관성 확인이 필요합니다.');
 return {freeCredits:free,paidCredits:paid,heldFree:user.heldFree||0,heldPaid:user.heldPaid||0};
}
export const styleDefaults={blogName:'',greeting:'',closing:'',tone:'friendly',emoji:true,instructions:'',preset:'custom'};
export const jaeinitStyle={...styleDefaults,preset:'jaeinit',blogName:'잰잇',greeting:'안녕하세요! 여행블로거 잰잇입니다 ^ㅎ^',closing:'오늘 포스팅이 도움 되셨다면 공감이랑 서이추 꾸욱 눌러주세요!\n다음에 더 알찬 여행 정보로 돌아올게요 💖'};
export function validateStyle(value={}){
 const style={...(value.preset==='jaeinit'?jaeinitStyle:styleDefaults)};
 for(const k of ['blogName','greeting','closing','instructions']){
  const v=value[k]??style[k];
  if(typeof v!=='string'||v.length>(k==='instructions'?1500:500))throw new HttpsError('invalid-argument','스타일 입력 길이를 확인하세요.');
  style[k]=v;
 }
 if(!['friendly','informative','emotional'].includes(value.tone??style.tone))throw new HttpsError('invalid-argument','말투 오류');
 style.tone=value.tone??style.tone;
 if(value.emoji!==undefined&&typeof value.emoji!=='boolean')throw new HttpsError('invalid-argument','이모지 설정 오류');
 style.emoji=value.emoji??true;
 style.preset=value.preset==='jaeinit'?'jaeinit':'custom';
 return style;
}
