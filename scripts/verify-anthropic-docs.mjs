// Read-only official API references. No credentials or paid API requests.
import {writeFile,mkdir,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
const pages=[
 ['models','https://platform.claude.com/docs/en/about-claude/models/overview','claude-sonnet-4-6'],
 ['web-search','https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool','web_search_20250305'],
 ['streaming','https://platform.claude.com/docs/en/build-with-claude/streaming','content_block_delta'],
 ['pricing','https://platform.claude.com/docs/en/about-claude/pricing','Sonnet']
];
const sdkURL='https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/src/resources/messages/messages.ts';
async function read(url){
 let output='';
 try{
  const result=await execute('curl',['--silent','--show-error','--location','--max-time','30','--header','Accept: text/markdown','--write-out','\n%{http_code}',url],{maxBuffer:10*1024*1024});output=result.stdout;
 }catch(error){output=error.stdout||'';}
 const split=output.lastIndexOf('\n'),status=Number(output.slice(split+1));
 return {url,status:status||'network-unavailable',text:status===200?output.slice(0,split):''};
}
await mkdir('.local/ci-reports',{recursive:true});
const evidence=[];let sdk;
for(const [name,url,required] of pages){
 const page=await read(url),websiteVerified=page.status===200&&page.text.toLowerCase().includes(required.toLowerCase());
 let source=page,verified=websiteVerified;
 if(!verified&&name!=='pricing'){
  sdk??=await read(sdkURL);
  source=sdk;verified=sdk.status===200&&sdk.text.includes(required);
 }
 const record={name,websiteURL:url,websiteStatus:page.status,websiteVerified,sourceURL:source.url,sourceStatus:source.status,verified,
  verifiedContract:verified?(name==='pricing'?'pricing page available; rates require operator verification':required):null,sourceSHA256:source.text?createHash('sha256').update(source.text).digest('hex'):null,checkedAt:new Date().toISOString()};
 evidence.push(record);
 if(!verified&&name!=='pricing')throw new Error(`Official ${name} API contract could not be verified from either documentation or the official SDK API reference`);
 console.log(`${name}: ${verified?'verified':'NOT VERIFIED'}; source=${source.url}; website=${page.status}`);
 if(!verified)console.log('Pricing webpage unavailable: configured USD rates remain estimates requiring an operator check; no live billing was measured.');
}
await writeFile('.local/ci-reports/anthropic-doc-evidence.json',JSON.stringify(evidence,null,2)+'\n');
if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`pricing=${evidence.at(-1).verified?'page available; rates require operator verification':'NOT VERIFIED; configured rates are estimates'}\n`);
