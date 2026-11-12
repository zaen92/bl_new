import {ensureArtifact, requiredArtifacts, checkJava, cacheDirectory} from './emulator-cache.mjs';
const args=process.argv.slice(2);
try{
 const preflight=args[0]==='--preflight';
 const targets=preflight?await requiredArtifacts(args.slice(1)):['firestore',...(args.includes('--ui')?['ui']:[])];
 console.log(`Firebase emulator cache: ${cacheDirectory}`);
 if(targets.some(t=>['firestore'].includes(t)))checkJava();
 const reuseFrom=[];
 for(let i=0;i<args.length;i++)if(args[i]==='--reuse-from'){
  if(!args[i+1])throw new Error('--reuse-from requires an existing official-cache directory.');
  reuseFrom.push(args[++i]);
 }
 for(const name of targets)await ensureArtifact(name,{checkOnly:preflight || args.includes('--check'),reuseFrom});
 if(targets.length===0)console.log('Selected Auth/Functions JavaScript emulators need no JAR cache.');
}catch(error){console.error(`Emulator readiness failed: ${error.message}`);process.exitCode=1;}
