// One allowlist for device writes, imports, exports and account saves. No image,
// auth, entitlement, billing or usage fields can pass through this boundary.
const fields=['title_1','title_2','title_3','keyword_main','keyword_sub','keyword_location','keyword_intent','place_name','place_address','place_hours','place_price','body','reel','thumbnail'];
function text(value,max=60000){if(value==null)return '';if(typeof value!=='string'||value.length>max||/data:image|blob:|iVBORw0KGgo[A-Za-z0-9+/]{50}|\/9j\/[A-Za-z0-9+/]{100}/i.test(value))throw new Error('사진 데이터 없이 올바른 텍스트 JSON을 사용하세요.');return value;}
export function textDocument(p){
 if(!p||typeof p!=='object'||Array.isArray(p))throw new Error('글 데이터 형식 오류');
 if(p.imgs!==undefined&&!Array.isArray(p.imgs))throw new Error('사진 목록 형식 오류');
 if(p.data!==undefined&&p.data!==null&&(typeof p.data!=='object'||Array.isArray(p.data)||typeof p.data.body!=='string'))throw new Error('본문 데이터 형식 오류');
 const data=p.data?Object.fromEntries(fields.map(f=>[f,text(p.data[f],f==='body'?60000:10000)])):null;
 if(data){if(p.data.hashtags!==undefined&&(!Array.isArray(p.data.hashtags)||p.data.hashtags.length>50))throw new Error('태그 형식 오류');data.hashtags=(p.data.hashtags||[]).map(t=>text(t,200));}
 const form=Object.fromEntries(['ti','mi','ci','ii'].map(f=>[f,text(p.form?.[f],20000)]));
 const positions=[...new Set([...(data?.body||'').matchAll(/\[사진(\d{1,2})\]/g)].map(m=>Number(m[1])))].filter(n=>n>0&&n<=99);
 const style=p.style?Object.fromEntries(['blogName','greeting','closing','tone','instructions','preset'].map(k=>[k,text(p.style[k],1500)])):null;if(style)style.emoji=p.style.emoji!==false;
 return {schemaVersion:3,title:text(p.title,500),type:text(p.type,50),volume:text(p.volume,20),date:text(p.date,100),form,data,style,photoPositions:positions,imgs:[],photosRequireAttachment:true};
}
