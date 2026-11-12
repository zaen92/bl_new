#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/firebase-local.sh emulators:exec --project demo-jaeinit --only auth,firestore,functions,storage 'STEP2_E2E=1 npm run test:ui'
