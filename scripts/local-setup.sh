#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export npm_config_cache="${npm_config_cache:-/workspace/.cache/npm}"
npm ci --no-audit --no-fund
export PATH="$PWD/node_modules/.bin:$PATH"
npm --prefix functions ci --no-audit --no-fund
# Emulator-only placeholders, never real provider keys. Preserve existing values.
node --input-type=module <<'NODE'
import {readFileSync,appendFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
for(const [file,defaults] of [
 ['functions/.secret.local',{SIGNUP_IDENTITY_HMAC_KEY:randomBytes(32).toString('hex'),CLAUDE_API_KEY:'local-mock-not-a-real-key',NAVER_CLIENT_ID:'local-mock-id',NAVER_CLIENT_SECRET:'local-mock-secret'}],
 ['functions/.env.local',{AI_PROVIDER_MODE:'mock',AI_MOCK_DELAY_MS:'0',ENFORCE_APP_CHECK:'false'}]
]){
 let text='';try{text=readFileSync(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
 const keys=new Set(text.split('\n').map(line=>line.split('=')[0].trim()));
 const missing=Object.entries(defaults).filter(([key])=>!keys.has(key));
 if(missing.length)appendFileSync(file,(text&&!text.endsWith('\n')?'\n':'')+missing.map(([key,value])=>key+'='+value+'\n').join(''),{mode:0o600});
}
NODE
npm run build

# Prepare verified official artifacts once; later tests never auto-download.
npm run emulators:prepare -- --ui --storage
