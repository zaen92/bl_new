import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {sanitizeLog,parseCounts} from '../../scripts/ci-utils.mjs';
test('CI logs redact known secret values, bearer tokens and Emulator verification codes',()=>{
 const log='unit-secret-marker Authorization: Bearer unit-token https://example.test/?oobCode=unit-code&mode=verifyEmail {"idToken":"unit-token","password":"unit-password"}';
 const safe=sanitizeLog(log,['unit-secret-marker']);
 for(const secret of ['unit-secret-marker','unit-token','unit-code','unit-password'])assert.ok(!safe.includes(secret));
 assert.ok(safe.includes('mode=verifyEmail'));
});
test('CI counts preserve failures/skips and reject missing test evidence',()=>{
 assert.deepEqual(parseCounts('# tests 18\n# pass 17\n# fail 1\n# skipped 0\n'),{total:18,passed:17,failed:1,skipped:0});
 assert.deepEqual(parseCounts('  1 failed\n  1 passed (2s)\n'),{total:2,passed:1,failed:1,skipped:0});
 assert.equal(parseCounts('No test suite started'),null);
});
test('CI command runner preserves failing exit status and uploads only sanitized output',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ci-report-'));
 try{
  const r=spawnSync(process.execPath,['scripts/ci-run.mjs','fixture',process.execPath,'-e',"console.log('https://example.test/?oobCode=unit-code'); process.exit(7)"],{encoding:'utf8',env:{...process.env,CI_REPORT_DIR:directory}});
  assert.equal(r.status,7);
  const log=await readFile(join(directory,'fixture.log'),'utf8');
  assert.ok(!log.includes('unit-code'));assert.ok(!r.stdout.includes('unit-code'));
  const receipt=JSON.parse(await readFile(join(directory,'fixture.json'),'utf8'));
  assert.equal(receipt.childExitCode,7);assert.equal(receipt.exitCode,7);assert.equal(receipt.counts,null);
 }finally{await rm(directory,{recursive:true,force:true});}
});
