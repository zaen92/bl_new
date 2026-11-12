import {plainText} from './service-policy.js';
import {buildPrompt} from './prompt.js';
export class ProviderError extends Error{
 constructor(code,usage=null){super(code);this.code=code;this.usage=usage;}
}
export const resultFields=['title_1','title_2','title_3','keyword_main','keyword_sub','keyword_location','keyword_intent','place_name','place_address','place_hours','place_price','body','reel','thumbnail'];
export function parseResult(text){
 if(typeof text!=='string'||!text.trim())throw new ProviderError('empty_response');
 let value;
 try{value=JSON.parse(text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/,'$1'));}catch{throw new ProviderError('invalid_json');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ProviderError('invalid_json');
 const result={};
 for(const field of resultFields){
  if(typeof value[field]!=='string'||value[field].length>(field==='body'?60000:10000))throw new ProviderError('invalid_result');
  try{result[field]=plainText(value[field],field==='body'?60000:10000);}catch{throw new ProviderError('invalid_result');}
 }
 if(['title_1','title_2','title_3','body'].some(f=>!result[f].trim()))throw new ProviderError('empty_result');
 if(!Array.isArray(value.hashtags)||value.hashtags.length>50||value.hashtags.some(t=>typeof t!=='string'||t.length>200))throw new ProviderError('invalid_result');
 try{result.hashtags=value.hashtags.map(t=>plainText(t,200));}catch{throw new ProviderError('invalid_result');}
 return result;
}
export async function* readSSE(body){
 let buffer='';const decoder=new TextDecoder();
 for await(const bytes of body){
  buffer=(buffer+decoder.decode(bytes,{stream:true})).replace(/\r\n/g,'\n');
  let end;
  while((end=buffer.indexOf('\n\n'))>=0){
   const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);
   const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
   if(data&&data!=='[DONE]'){try{yield JSON.parse(data);}catch{throw new ProviderError('invalid_stream');}}
  }
  buffer=buffer.replace(/\r\n/g,'\n');
  if(buffer.length>1000000)throw new ProviderError('stream_limit');
 }
 if(buffer.trim()&&!buffer.trim().startsWith(':')){
  const data=buffer.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
  if(data&&data!=='[DONE]'){try{yield JSON.parse(data);}catch{throw new ProviderError('invalid_stream');}}
 }
}
export async function naverLookup(query,{clientId,clientSecret,signal,fetcher=fetch}){
 if(!clientId||!clientSecret)return null;
 try{
  const response=await fetcher('https://openapi.naver.com/v1/search/local.json?display=1&query='+encodeURIComponent(query.slice(0,500)),{signal,headers:{'X-Naver-Client-Id':clientId,'X-Naver-Client-Secret':clientSecret}});
  if(!response.ok)return null;
  const item=(await response.json()).items?.[0];
  return item?{name:String(item.title||'').replace(/<[^>]*>/g,''),address:item.roadAddress||item.address||'',tel:item.telephone||'',category:item.category||''}:null;
 }catch{if(signal?.aborted)throw new ProviderError('timeout');return null;}
}
export function anthropicProvider({apiKey,naverId,naverSecret,fetcher=fetch}){
 return async ({input,style,config,photos,onProgress,signal})=>{
  const usage={inputTokens:0,outputTokens:0,searches:0};let counted=false,generationSent=false;
  try{
   if(!apiKey)throw new ProviderError('provider_not_configured');
   await onProgress({phase:'searching',text:''});
   const place=await naverLookup(input.title,{clientId:naverId,clientSecret:naverSecret,fetcher,signal});
   const fullInput={...input,photos,placeInfo:input.placeInfo+(place?'\n[네이버 지역검색]\n'+JSON.stringify(place):'')};
   const content=photos.map(p=>({type:'image',source:{type:'base64',media_type:p.mime,data:p.buffer.toString('base64')}}));
   content.push({type:'text',text:buildPrompt(fullInput,style)});
   const headers={'content-type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'};
   const messages=[{role:'user',content}];
   const tools=config.maxSearches?[{type:'web_search_20250305',name:'web_search',max_uses:config.maxSearches}]:[];
   const base={model:config.model,messages,...(tools.length?{tools}:{})};
   let text='',stop=null;
   usage.apiRequests=0;
   for(let round=0;round<config.maxProviderRequests;round++){
    const remainingSearches=Math.max(0,config.maxSearches-usage.searches);
    const current={...base,messages,...(tools.length?{tools:[{...tools[0],max_uses:Math.max(1,remainingSearches)}]}:{})};
    const count=await fetcher('https://api.anthropic.com/v1/messages/count_tokens',{method:'POST',headers,signal,body:JSON.stringify(current)});
    if(!count.ok)throw new ProviderError('token_count_failed');
    const tokens=(await count.json()).input_tokens;
    if(!Number.isSafeInteger(tokens)||tokens<0||tokens>(round===0?config.maxInputTokens:config.maxBillableInputTokens))throw new ProviderError('input_token_limit');
    generationSent=true;usage.uncertain=true;
    const response=await fetcher('https://api.anthropic.com/v1/messages',{method:'POST',headers,signal,body:JSON.stringify({...current,max_tokens:Math.max(1,config.maxOutputTokens-usage.outputTokens),stream:true})});
    if(!response.ok)throw new ProviderError('provider_http_'+response.status,response.status>=400&&response.status<500?{...usage,uncertain:false}:null);
    counted=true;usage.apiRequests++;
    const blocks=[];let roundOutput=0,roundInput=0,roundSearches=0;const inputBefore=usage.inputTokens,outputBefore=usage.outputTokens,searchesBefore=usage.searches;stop=null;
    for await(const event of readSSE(response.body)){
     if(event.type==='error')throw new ProviderError('provider_stream_error');
     if(event.type==='message_start'){roundInput=event.message?.usage?.input_tokens||0;roundOutput=event.message?.usage?.output_tokens||0;usage.inputTokens=inputBefore+roundInput;usage.outputTokens=outputBefore+roundOutput;}
     if(event.type==='content_block_start'){
      blocks[event.index??blocks.length]=structuredClone(event.content_block);
      if(event.content_block?.type==='server_tool_use'&&event.content_block?.name==='web_search'){roundSearches++;usage.searches=searchesBefore+roundSearches;}
     }
     if(event.type==='content_block_delta'){
      const block=blocks[event.index];
      if(event.delta?.partial_json && block)block._json=(block._json||'')+event.delta.partial_json;
      if(event.delta?.thinking && block)block.thinking=(block.thinking||'')+event.delta.thinking;
      if(event.delta?.signature && block)block.signature=(block.signature||'')+event.delta.signature;
      if(typeof event.delta?.text==='string'){
       text+=event.delta.text;if(block)block.text=(block.text||'')+event.delta.text;
       if(text.length>100000)throw new ProviderError('output_limit');
       await onProgress({phase:'generating',text});
      }
     }
     if(event.type==='message_delta'){
      roundOutput=event.usage?.output_tokens??roundOutput;
      roundInput=event.usage?.input_tokens??roundInput;
      roundSearches=Math.max(roundSearches,event.usage?.server_tool_use?.web_search_requests||0);
      usage.inputTokens=inputBefore+roundInput;usage.outputTokens=outputBefore+roundOutput;usage.searches=searchesBefore+roundSearches;
      stop=event.delta?.stop_reason??stop;
     }
    }
    usage.outputTokens=outputBefore+roundOutput;
    usage.uncertain=stop===null;
    if(usage.inputTokens>config.maxBillableInputTokens*config.maxProviderRequests||usage.outputTokens>config.maxOutputTokens||usage.searches>config.maxSearches)throw new ProviderError('usage_limit');
    if(stop==='end_turn')break;
    if(stop!=='pause_turn')throw new ProviderError(stop==='refusal'?'refusal':stop==='max_tokens'?'output_token_limit':'incomplete_response');
    if(round+1>=config.maxProviderRequests||(tools.length>0&&usage.searches>=config.maxSearches))throw new ProviderError('continuation_limit');
    for(const block of blocks)if(block?._json){try{block.input=JSON.parse(block._json);delete block._json;}catch{throw new ProviderError('invalid_stream');}}
    messages.push({role:'assistant',content:blocks.filter(Boolean)});
   }
   if(stop!=='end_turn')throw new ProviderError('incomplete_response');
   const result=parseResult(text);
   return {result,usage,provider:'anthropic',place};
  }catch(error){
   const e=error instanceof ProviderError?error:new ProviderError(signal.aborted?'timeout':'provider_network_error');
   e.usage=e.usage||(counted?usage:!generationSent?{inputTokens:0,outputTokens:0,searches:0}:null);throw e;
  }
 };
}
export function mockProvider({delayMs=0}={}){
 return async({input,style,photos,onProgress,signal})=>{
  if(signal.aborted)throw new ProviderError('timeout');
  await onProgress({phase:'searching',text:''});
  const result=Object.fromEntries(resultFields.map(k=>[k,'mock '+k]));
  Object.assign(result,{title_1:input.title+' 후기',title_2:input.title+' 정보',title_3:input.title+' 추천',body:(style.greeting||'안녕하세요!')+'\n'+input.content+'\n'+photos.map((_,i)=>`[사진${i+1}]\n사진 ${i+1} 설명`).join('\n')+'\n'+(style.closing||'읽어주셔서 감사합니다.'),hashtags:['#후기','#블로그'],place_name:'mock 장소'});
  const text=JSON.stringify(result);
  await onProgress({phase:'generating',text:text.slice(0,Math.ceil(text.length/2))});
  if(delayMs>0)await new Promise((resolve,reject)=>{
   const aborted=()=>{clearTimeout(timer);reject(new ProviderError('timeout'));};
   const timer=setTimeout(()=>{signal.removeEventListener('abort',aborted);resolve();},Math.min(3000,delayMs));signal.addEventListener('abort',aborted,{once:true});
  });
  await onProgress({phase:'generating',text});
  return {result:parseResult(JSON.stringify(result)),usage:{inputTokens:500,outputTokens:700,searches:1},provider:'mock'};
 };
}
