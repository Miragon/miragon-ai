#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

git submodule update --init --recursive

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
fi

pnpm install --frozen-lockfile

pnpm -F @miragon-ai/client-camunda7 generate

pnpm build

(cd plugins && ./gradlew build -x test)
