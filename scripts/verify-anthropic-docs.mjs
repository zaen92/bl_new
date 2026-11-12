// Public documentation only: no API credentials or paid API requests.
import {writeFile,mkdir} from 'node:fs/promises';
const pages=[
 ['models','https://platform.claude.com/docs/en/about-claude/models/overview','claude-sonnet-4-6'],
 ['web-search','https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool','web_search_20250305'],
 ['streaming','https://platform.claude.com/docs/en/build-with-claude/streaming','content_block_delta'],
 ['pricing','https://platform.claude.com/docs/en/about-claude/pricing','Sonnet']
];
await mkdir('.local/ci-reports',{recursive:true});
const evidence=[];
for(const [name,url,required] of pages){
 const response=await fetch(url,{headers:{Accept:'text/markdown'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(`Official ${name} documentation unavailable (HTTP ${response.status})`);
 const text=await response.text();
 if(!text.toLowerCase().includes(required.toLowerCase()))throw new Error(`Official ${name} documentation no longer contains the implemented contract: review before release.`);
 evidence.push({name,url:response.url,status:response.status,verifiedContract:required,checkedAt:new Date().toISOString()});
 console.log(`${name}: official documentation HTTP ${response.status}, implemented contract verified`);
}
await writeFile('.local/ci-reports/anthropic-doc-evidence.json',JSON.stringify(evidence,null,2)+'\n');
