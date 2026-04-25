#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  echo "ERROR: node_modules missing — run setup first." >&2
  exit 1
fi

exec pnpm dev
