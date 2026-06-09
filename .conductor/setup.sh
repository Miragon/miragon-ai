#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  sed "s|\$(pwd)|$(pwd)|g" .env.example > .env
  echo "Created .env from .env.example"
fi

pnpm install --frozen-lockfile

pnpm -F @miragon-ai/client-cibseven generate

pnpm build

if ! command -v java >/dev/null 2>&1; then
  echo "Error: java not found on PATH. Install a JDK to build the engine plugins." >&2
  exit 1
fi

(cd engine-plugins && ./gradlew build -x test)
