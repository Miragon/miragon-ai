#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

git submodule update --init --recursive

pnpm install --no-frozen-lockfile

pnpm -F @miragon-ai/client-cibseven generate

pnpm build

(cd plugins && ./gradlew build -x test)
