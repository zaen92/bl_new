import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseResult,readSSE,anthropicProvider,naverLookup,mockProvider,ProviderError} from '../functions/src/ai-provider.js';
import {DEFAULT_AI_CONFIG,validateAIConfig,validateStyle,buckets} from '../functions/src/ai-config.js';
import {buildPrompt} from '../functions/src/prompt.js';
const input={title:'서울 카페',memo:'메모',content:'직접 경험',placeInfo:'서울',type:'카페',volume:'normal'};
const fixture=()=>Object.assign(Object.fromEntries(['title_1','title_2','title_3','keyword_main','keyword_sub','keyword_location','keyword_intent','place_name','place_address','place_hours','place_price','body','reel','thumbnail'].map(k=>[k,'테스트 '+k])),{hashtags:['#카페']});
const stream=(text,stop='end_turn')=>[
 {type:'message_start',message:{usage:{input_tokens:200}}},
 {type:'content_block_start',content_block:{type:'server_tool_use',name:'web_search'}},
 {type:'content_block_delta',delta:{text}},
 {type:'message_delta',delta:{stop_reason:stop},usage:{output_tokens:300}}
].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('');
test('AI result JSON requires all original fields and rejects malformed or empty output',()=>{
 const result=fixture();assert.deepEqual(parseResult(JSON.stringify(result)),result);
 assert.deepEqual(parseResult('```json\n'+JSON.stringify(result)+'\n```'),result);
 for(const raw of ['', 'not JSON','[]',JSON.stringify({...result,body:''}),JSON.stringify({...result,title_2:null})])assert.throws(()=>parseResult(raw),ProviderError);
});
test('SSE parser handles split UTF-8 CRLF frames without dropping content',async()=>{
 const bytes=Buffer.from('data: {"text":"한국어"}\r\n\r\ndata: {"done":true}\r\n\r\n');
 async function* body(){for(let i=0;i<bytes.length;i+=3)yield bytes.subarray(i,i+3);}
 const values=[];for await(const v of readSSE(body()))values.push(v);
 assert.deepEqual(values,[{text:'한국어'},{done:true}]);
});
test('Anthropic adapter mock HTTP counts tokens and streams supported model/search/photo request',async()=>{
 const calls=[],progress=[];
 const fetcher=async(url,options)=>{
  calls.push({url,payload:JSON.parse(options.body),headers:options.headers});
  return url.endsWith('count_tokens')?Response.json({input_tokens:200}):new Response(stream(JSON.stringify(fixture())));
 };
 const provider=anthropicProvider({apiKey:'test-only-placeholder',fetcher});
 const outcome=await provider({input,style:validateStyle({greeting:'제 인사'}),config:DEFAULT_AI_CONFIG,photos:[{mime:'image/png',buffer:Buffer.from('fixture')}],signal:new AbortController().signal,onProgress:async p=>progress.push(p)});
 assert.equal(calls.length,2);assert.equal(calls[1].payload.model,'claude-sonnet-4-6');
 assert.equal(calls[1].payload.tools[0].type,'web_search_20250305');assert.equal(calls[1].payload.tools[0].max_uses,3);
 assert.equal(calls[1].payload.messages[0].content[0].type,'image');assert.equal(outcome.usage.searches,1);assert.equal(outcome.usage.outputTokens,300);assert.ok(progress.length>=2);
});
test('Naver local search stays server-side and normalizes location data',async()=>{
 let received;
 const place=await naverLookup('카페',{clientId:'test-id',clientSecret:'test-secret',fetcher:async(url,options)=>{received={url,options};return Response.json({items:[{title:'<b>카페</b>',roadAddress:'도로명',address:'지번',telephone:'',category:'카페'}]});}});
 assert.equal(place.name,'카페');assert.equal(place.address,'도로명');assert.equal(received.options.headers['X-Naver-Client-Secret'],'test-secret');
 assert.equal(await naverLookup('x',{clientId:'',clientSecret:''}),null);
});
test('refusal, malformed JSON, HTTP failure and token limit errors keep safe codes and usage',async()=>{
 for(const [text,stop,code] of [['x','refusal','refusal'],['x','end_turn','invalid_json'],['','end_turn','empty_response'],['{}','max_tokens','output_token_limit']]){
  const p=anthropicProvider({apiKey:'test',fetcher:async url=>url.endsWith('count_tokens')?Response.json({input_tokens:2}):new Response(stream(text,stop))});
  await assert.rejects(p({input,style:{},config:DEFAULT_AI_CONFIG,photos:[],onProgress:async()=>{},signal:new AbortController().signal}),e=>e.code===code&&e.usage.outputTokens===300);
 }
 const interrupted=anthropicProvider({apiKey:'test',fetcher:async url=>url.endsWith('count_tokens')?Response.json({input_tokens:2}):new Response('data: '+JSON.stringify({type:'message_start',message:{usage:{input_tokens:2}}})+'\n\n')});
 await assert.rejects(interrupted({input,style:{},config:DEFAULT_AI_CONFIG,photos:[],onProgress:async()=>{},signal:new AbortController().signal}),e=>e.code==='incomplete_response'&&e.usage.uncertain===true);
 const p=anthropicProvider({apiKey:'test',fetcher:async url=>url.endsWith('count_tokens')?Response.json({input_tokens:9999999}):new Response('',{status:401})});
 await assert.rejects(p({input,style:{},config:DEFAULT_AI_CONFIG,photos:[],onProgress:async()=>{},signal:new AbortController().signal}),{code:'input_token_limit'});
});
test('personalization overrides fixed brand/greeting/closing while jaeinit preset stays selectable',()=>{
 const style=validateStyle({blogName:'제 블로그',greeting:'제 인사',closing:'제 마무리',emoji:false,tone:'informative',instructions:'정보 중심'});
 const prompt=buildPrompt(input,style);
 assert.ok(prompt.includes('제 인사'));assert.ok(prompt.includes('제 마무리'));assert.ok(!prompt.includes('여행블로거 잰잇'));assert.ok(!prompt.includes('다음에 더 알찬 여행'));assert.ok(prompt.includes('사용하지 마세요'));
 assert.ok(buildPrompt(input,validateStyle({preset:'jaeinit'})).includes('여행블로거 잰잇'));
});
test('mock provider marks itself mock and preserves photo markers and custom writing style',async()=>{
 const result=await mockProvider()({input,style:validateStyle({greeting:'커스텀 인사',closing:'커스텀 마무리'}),photos:[{},{}],onProgress:async()=>{},signal:new AbortController().signal});
 assert.equal(result.provider,'mock');assert.ok(result.result.body.includes('[사진2]'));assert.ok(result.result.body.includes('커스텀 인사'));assert.ok(result.result.body.includes('커스텀 마무리'));
});
test('limits/pricing validation and additive legacy bucket migration preserve total credits',()=>{
 assert.deepEqual(buckets({credits:5}),{freeCredits:2,paidCredits:3,heldFree:0,heldPaid:0});
 assert.throws(()=>buckets({credits:2,freeCredits:2,paidCredits:2}));
 for(const change of [{maxSearches:11},{timeoutMs:999999},{maxPhotos:11},{maxBillableInputTokens:1},{inputMicrosPerToken:0}])assert.throws(()=>validateAIConfig(change));
 assert.equal(validateAIConfig({enabled:false}).enabled,false);
});
test('browser modules have no provider secret names or direct Claude/Naver API URLs',async()=>{
 for(const name of ['src/api.js','src/firebase.js','src/studio.js','src/generation-ui.js','src/blog-style.js','index.html']){
  const text=await readFile(name,'utf8');
  for(const forbidden of ['api.anthropic.com','openapi.naver.com','CLAUDE_API_KEY','NAVER_CLIENT_SECRET','anthropic-dangerous-direct-browser-access'])assert.ok(!text.includes(forbidden),name+': '+forbidden);
 }
});
test('official web-search pause_turn is continued with bounded requests and aggregate usage',async()=>{
 let rounds=0;const requests=[];
 const provider=anthropicProvider({apiKey:'test',fetcher:async(url,options)=>{
  if(url.endsWith('count_tokens'))return Response.json({input_tokens:200});
  requests.push(JSON.parse(options.body));rounds++;
  return new Response(stream(rounds===1?'':JSON.stringify(fixture()),rounds===1?'pause_turn':'end_turn'));
 }});
 const result=await provider({input,style:{},config:DEFAULT_AI_CONFIG,photos:[],signal:new AbortController().signal,onProgress:async()=>{}});
 assert.equal(rounds,2);assert.equal(requests[1].messages[1].role,'assistant');assert.equal(result.usage.apiRequests,2);assert.equal(result.usage.outputTokens,600);
 const stopped=anthropicProvider({apiKey:'test',fetcher:async url=>url.endsWith('count_tokens')?Response.json({input_tokens:1}):new Response(stream('','pause_turn'))});
 await assert.rejects(stopped({input,style:{},config:{...DEFAULT_AI_CONFIG,maxProviderRequests:1},photos:[],signal:new AbortController().signal,onProgress:async()=>{}}),{code:'continuation_limit'});
});
