import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {artifactFor,verifyArtifact,requiredArtifacts,projectRoot} from '../scripts/emulator-cache.mjs';

test('artifact verifier rejects missing, truncated and same-size tampered bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cache-validator-'));
 try{
  // Byte fixtures exercise integrity checks only; never launched as emulators.
  const file=join(dir,'validator-fixture.bin'),bytes=Buffer.from('integrity-fixture');
  const item={expectedSize:bytes.length,expectedChecksum:createHash('md5').update(bytes).digest('hex'),expectedChecksumSHA256:createHash('sha256').update(bytes).digest('hex')};
  assert.equal((await verifyArtifact(file,item)).reason,'missing');
  await writeFile(file,bytes.subarray(1));assert.equal((await verifyArtifact(file,item)).valid,false);
  await writeFile(file,Buffer.alloc(bytes.length));assert.equal((await verifyArtifact(file,item)).reason,'SHA-256 mismatch');
  await writeFile(file,bytes);assert.equal((await verifyArtifact(file,item)).valid,true);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('real preflight rejects corrupt cache without downloading, deleting or executing it',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cache-preflight-'));
 try{
  const file=join(dir,artifactFor('firestore').fileName);
  const bytes='invalid-byte-fixture-not-an-emulator';await writeFile(file,bytes);
  const result=spawnSync(process.execPath,['scripts/prepare-emulators.mjs','--check'],{
   cwd:projectRoot,encoding:'utf8',env:{...process.env,FIREBASE_EMULATORS_PATH:dir}
  });
  assert.equal(result.status,1);
  assert.match(result.stderr,/No download attempted by preflight/);
  assert.doesNotMatch(result.stdout,/preparing https:|downloading/);
  assert.equal(await readFile(file,'utf8'),bytes);
  assert.deepEqual(await readdir(dir),[artifactFor('firestore').fileName]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('preflight selects only required artifacts and distinguishes Auth-only and optional UI',async()=>{
 assert.deepEqual(await requiredArtifacts(['emulators:exec','--only','auth,firestore,functions','test']),['firestore']);
 assert.deepEqual(await requiredArtifacts(['emulators:exec','--only=auth','test']),[]);
 assert.deepEqual(await requiredArtifacts(['emulators:start','--only','auth,firestore,functions']),['firestore','ui']);
 assert.deepEqual(await requiredArtifacts(['emulators:exec','--only','auth','--ui','test']),['ui']);
});
