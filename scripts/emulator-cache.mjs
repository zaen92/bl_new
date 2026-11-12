import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {copyFile, mkdir, readFile, rename, stat, access} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname, resolve, join, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';

const require=createRequire(import.meta.url);
export const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const cliRoot=dirname(require.resolve('firebase-tools/package.json'));
export const cacheDirectory=resolve(process.env.FIREBASE_EMULATORS_PATH || join(projectRoot,'../.cache/firebase'));
const manifest=JSON.parse(await readFile(join(cliRoot,'lib/emulator/downloadableEmulatorInfo.json'),'utf8'));
export function artifactFor(name){
 const item=name==='ui'?manifest.ui.main:manifest[name];
 if(!['firestore','storage','ui'].includes(name) || !item || !/^[a-f0-9]{64}$/.test(item.expectedChecksumSHA256) || !/^[a-f0-9]{32}$/.test(item.expectedChecksum) || item.expectedSize<=0)throw new Error('Pinned official CLI artifact metadata is required.');
 const url=new URL(item.remoteUrl);
 if(url.protocol!=='https:' || url.hostname!=='storage.googleapis.com')throw new Error('Unexpected official artifact URL.');
 return {...item,name,fileName:item.downloadPathRelativeToCacheDir};
}
export async function verifyArtifact(file, item){
 let info;
 try{info=await stat(file);}catch(error){if(error.code==='ENOENT')return {valid:false,reason:'missing'};throw error;}
 if(!info.isFile())return {valid:false,reason:'not a file'};
 if(info.size!==item.expectedSize)return {valid:false,reason:`size ${info.size} != ${item.expectedSize}`};
 const sha=createHash('sha256'),md5=createHash('md5');
 for await(const bytes of createReadStream(file)){sha.update(bytes);md5.update(bytes);}
 if(sha.digest('hex')!==item.expectedChecksumSHA256)return {valid:false,reason:'SHA-256 mismatch'};
 if(md5.digest('hex')!==item.expectedChecksum)return {valid:false,reason:'MD5 mismatch'};
 return {valid:true,reason:'size + SHA-256 + MD5 verified'};
}
export function officialCacheCandidates(extra=[]){
 return [...new Set([cacheDirectory,join(homedir(),'.cache/firebase/emulators'),...extra].map(p=>resolve(p)))];
}
async function exists(file){try{await access(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function guardOverrides(name){
 if(process.env[`${name.toUpperCase()}_EMULATOR_BINARY_PATH`])throw new Error(`${name} binary override is not supported by the verified-cache runner. Use FIREBASE_EMULATORS_PATH.`);
 if(name==='ui' && (process.env.FIREBASE_CLI_EXPERIMENTS || '').split(',').includes('emulatoruisnapshot'))throw new Error('Unpinned UI snapshot mode is not allowed by this runner.');
}
export async function ensureArtifact(name,{checkOnly=false,reuseFrom=[]}={}){
 guardOverrides(name);
 const item=artifactFor(name),destination=join(cacheDirectory,item.fileName);
 let result=await verifyArtifact(destination,item);
 console.log(`[${name}] ${destination}: ${result.reason}`);
 if(!result.valid && checkOnly)throw new Error(`${name} cache unavailable or invalid. Run npm run emulators:prepare${name==='ui'?' -- --ui':''} when official download access is available. No download attempted by preflight.`);
 if(!result.valid){
  await mkdir(cacheDirectory,{recursive:true});
  // Preserve suspect artifacts for diagnosis; never execute or silently accept them.
  if(await exists(destination)){
   const quarantine=join(cacheDirectory,'.invalid-artifacts');
   await mkdir(quarantine,{recursive:true});
   await rename(destination,join(quarantine,`${item.fileName}-${Date.now()}`));
  }
  for(const dir of officialCacheCandidates(reuseFrom)){
   const source=join(dir,item.fileName);
   if(source===destination)continue;
   const cached=await verifyArtifact(source,item);
   if(!cached.valid){console.log(`[${name}] reuse candidate ${source}: ${cached.reason}`);continue;}
   const staging=`${destination}.verified-${process.pid}`;
   await copyFile(source,staging);
   const copied=await verifyArtifact(staging,item);
   if(!copied.valid)throw new Error(`Reuse copy integrity failed: ${copied.reason}`);
   await rename(staging,destination);
   console.log(`[${name}] reused official artifact from ${source}`);result=copied;break;
  }
  if(!result.valid){
   console.log(`[${name}] preparing ${item.remoteUrl} with pinned official Firebase CLI`);
   const download=spawnSync(process.execPath,[join(cliRoot,'lib/bin/firebase.js'),`setup:emulators:${name}`,'--project','demo-jaeinit','--non-interactive'],{
    cwd:projectRoot,stdio:'inherit',env:{...process.env,FIREBASE_EMULATORS_PATH:cacheDirectory,XDG_CONFIG_HOME:process.env.XDG_CONFIG_HOME || join(projectRoot,'../.cache/config')}
   });
   if(download.error)throw download.error;
   if(download.status!==0)throw new Error(`Official ${name} preparation failed (exit ${download.status ?? download.signal}). No unverified artifact is usable.`);
  }
  result=await verifyArtifact(destination,item);
  if(!result.valid)throw new Error(`Official ${name} artifact integrity failed after preparation: ${result.reason}`);
 }
 if(name==='ui'){
  const binary=join(cacheDirectory,item.binaryPathRelativeToCacheDir);
  if(!await exists(binary)){
   if(checkOnly)throw new Error('Verified UI archive exists but extraction is missing; run npm run emulators:prepare -- --ui.');
   // Use the official extractor only after verifying the pinned archive.
   const {unzip}=require(join(cliRoot,'lib/unzip.js'));
   await unzip(destination,join(cacheDirectory,`ui-v${item.version}`));
   if(!await exists(binary))throw new Error('Official UI extraction did not produce its entry point.');
  }
 }
 console.log(`[${name}] READY ${basename(destination)} (${item.expectedChecksumSHA256})`);
 return destination;
}
export async function requiredArtifacts(args){
 function option(name){const i=args.indexOf(name);return i>=0?args[i+1]:args.find(a=>a.startsWith(name+'='))?.slice(name.length+1);}
 const only=option('--only');
 const services=only?only.split(',').map(s=>s.split(':')[0]):['auth','firestore','functions'];
 const targets=['firestore','storage'].filter(name=>services.includes(name));
 const command=args[0];
 const uiVisible=command==='emulators:start' || args.includes('--ui');
 if(uiVisible){
  const config=JSON.parse(await readFile(resolve(projectRoot,option('--config') || 'firebase.json'),'utf8'));
  if(args.includes('--ui') || config.emulators?.ui?.enabled!==false)targets.push('ui');
 }
 return targets;
}
export function checkJava(){
 const r=spawnSync('java',['-version'],{encoding:'utf8'});
 const output=(r.stderr || '')+(r.stdout || '');
 const major=Number(output.match(/version "(\d+)/)?.[1]);
 if(r.error || r.status!==0 || major<21 || !major)throw new Error('Java 21+ is required for this project Firestore workflow.');
 console.log(`Java ${major}: ready`);
}
