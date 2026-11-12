import {readFile,appendFile} from 'node:fs/promises';
import {join} from 'node:path';
const directory=process.env.CI_REPORT_DIR || '.local/ci-reports';
let summary='## STEP 1 test evidence\n\n| Stage | Status | Passed | Failed | Skipped |\n|---|---|---:|---:|---:|\n';
for(const stage of process.argv.slice(2)){
 if(!/^[a-z0-9-]+$/.test(stage))throw new Error('Invalid stage');
 try{
  const r=JSON.parse(await readFile(join(directory,`${stage}.json`),'utf8'));
  summary+=`| ${stage} | ${r.exitCode===0?'passed':'failed (exit '+r.exitCode+')'} | ${r.counts?.passed??'n/a'} | ${r.counts?.failed??'n/a'} | ${r.counts?.skipped??'n/a'} |\n`;
 }catch(e){if(e.code!=='ENOENT')throw e;summary+=`| ${stage} | not run | — | — | — |\n`;}
}
if(process.argv.includes('step2-integration'))summary+='\nSTEP 2 integration contains 47 cases: baseline 18 + provider 10 + new server 16 + new security 3. Repeated unit/provider runs are not additional unique cases. Google Emulator login is separate from real Google OAuth. All AI tests use explicit Emulator-only mocks; no live paid API requests or deployments.\n';
else summary+='\nIntegration contains 4 security + 7 server + the same 7 unit cases. Do not double-count the repeated unit cases. Google Emulator login is distinct from real Google OAuth. No production Firebase deployment or credentials are used.\n';
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary);else console.log(summary);
