#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

git submodule update --init --recursive

pnpm install --frozen-lockfile

pnpm -F @miragon-ai/client-cibseven generate

pnpm build

if [ ! -f .env ]; then
  sed "s|\$(pwd)|$(pwd)|g" .env.example > .env
  echo "Created .env from .env.example"
fi

(cd plugins && ./gradlew build -x test)
