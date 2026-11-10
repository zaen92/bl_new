#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .local
node --input-type=module -e 'import {writeFileSync} from "node:fs"; writeFileSync(".local/firebase-auth.json",JSON.stringify({emulators:{auth:{host:"127.0.0.1",port:9099},ui:{enabled:false},singleProjectMode:true}}));'
bash scripts/firebase-local.sh emulators:exec --config .local/firebase-auth.json --project demo-jaeinit --only auth 'AUTH_EMULATOR_TESTS=1 npm run test:ui -- tests/browser/auth.spec.js'
