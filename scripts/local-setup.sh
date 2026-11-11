#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export npm_config_cache="${npm_config_cache:-/workspace/.cache/npm}"
npm ci --no-audit --no-fund
export PATH="$PWD/node_modules/.bin:$PATH"
npm --prefix functions ci --no-audit --no-fund
# Local-only key. Do not rotate it on each startup; production uses Secret Manager.
if [ ! -f functions/.secret.local ]; then
  node --input-type=module -e 'import {writeFileSync} from "node:fs"; import {randomBytes} from "node:crypto"; writeFileSync("functions/.secret.local", "SIGNUP_IDENTITY_HMAC_KEY="+randomBytes(32).toString("hex")+"\n", {mode:0o600,flag:"wx"});'
fi
npm run build

# Prepare verified official artifacts once; later tests never auto-download.
npm run emulators:prepare -- --ui
