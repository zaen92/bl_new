#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export FIREBASE_EMULATORS_PATH="${FIREBASE_EMULATORS_PATH:-/workspace/.cache/firebase}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/workspace/.cache/config}"
export PATH="$PWD/node_modules/.bin:$PATH"
exec firebase "$@"
