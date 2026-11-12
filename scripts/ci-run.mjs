import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {sanitizeLog,parseCounts} from './ci-utils.mjs';
const [stage,command,...args]=process.argv.slice(2);
if(!/^[a-z0-9-]+$/.test(stage||'') || !command)throw new Error('Usage: node scripts/ci-run.mjs STAGE COMMAND [ARGS]');
const directory=resolve(process.env.CI_REPORT_DIR || '.local/ci-reports');
await mkdir(directory,{recursive:true});
const secrets=[];
try{
 const secretFile=await readFile('functions/.secret.local','utf8');
 for(const line of secretFile.split('\n'))if(line.includes('='))secrets.push(line.slice(line.indexOf('=')+1).trim());
}catch(e){if(e.code!=='ENOENT')throw e;}
const startedAt=new Date().toISOString();
let log='';
const emit=line=>{
 const safe=sanitizeLog(line,secrets);
 log+=safe+'\n';console.log(safe);
};
const child=spawn(command,args,{stdio:['ignore','pipe','pipe'],env:process.env});
const streams=[child.stdout,child.stderr].map(stream=>new Promise(resolve=>{
 const reader=createInterface({input:stream,crlfDelay:Infinity});reader.on('line',emit);reader.on('close',resolve);
}));
const childExit=await new Promise(resolve=>{
 child.on('error',e=>{emit(e.message);resolve(127);});
 child.on('close',(code,signal)=>{if(signal)emit(`Command terminated by ${signal}`);resolve(code??1);});
});
await Promise.all(streams);
const counts=parseCounts(log);
// Zero/skipped/missing cases must not silently validate required suites.
const expected={unit:7,integration:18,ui:4,auth:2,'ci-tools':3,'step2-unit':10,'step2-integration':47,'step2-e2e':4}[stage];
let exitCode=childExit;
let validationError=null;
if(childExit===0 && expected!==undefined && (!counts || counts.total!==expected || counts.passed!==expected || counts.skipped!==0 || counts.failed!==0)){
 exitCode=1;validationError=`Expected ${expected} passing cases, no skips; observed ${JSON.stringify(counts)}`;emit(validationError);
}
if(exitCode!==0){
 const evidence=log.split('\n').filter(line=>/not ok|error:|code:|expected:|actual:|operator:|Error:|Expected|documentation|timeout/i.test(line)).concat(log.split('\n').slice(-30)).join('\n').slice(-16000);
 const safe=sanitizeLog(evidence||`Command failed with exit ${exitCode}`,secrets).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
 console.log(`::error title=${stage} failed::${safe}`);
}
await writeFile(join(directory,`${stage}.log`),log);
await writeFile(join(directory,`${stage}.json`),JSON.stringify({stage,commit:process.env.GITHUB_SHA || null,startedAt,completedAt:new Date().toISOString(),childExitCode:childExit,exitCode,counts,validationError},null,2)+'\n');
process.exitCode=exitCode;
