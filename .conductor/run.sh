#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  echo "ERROR: node_modules missing — run setup first." >&2
  exit 1
fi

if [ ! -f .env ]; then
  sed "s|\$(pwd)|$(pwd)|g" .env.example > .env
  echo "Created .env from .env.example"
fi

# Default compose stack = infra only (CIB Seven, ClickHouse, OTEL, Jaeger, WireMock).
# The bundled MCP server lives behind the `full` profile and is intentionally not
# started here so `pnpm dev` can bind port 3010 without a conflict.
docker compose -f docker/docker-compose.yml up -d

exec pnpm dev
