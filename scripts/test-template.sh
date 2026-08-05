#!/usr/bin/env bash
set -euo pipefail

# Drift gate for templates/composed-server: builds the five published packages
# from THIS workspace, packs them into tarballs (pnpm pack rewrites
# workspace:* to real versions), points a throwaway copy of the template at
# the tarballs via pnpm overrides, and runs the template's full bar. Catches
# "the template no longer compiles against the packages we are about to
# release" before the release train publishes to npm. Run from anywhere;
# leaves the working tree untouched.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$ROOT/templates/composed-server"
PACK_DIR="$(mktemp -d)"
WORK="$(mktemp -d)/composed-server"

PACKAGES=(client-camunda7 client-analytics widget-shell mcp-camunda7 mcp-analytics)

# The template's committed @miragon-ai pins must match the workspace versions —
# release-please bumps both together via extra-files; a drifted pin means an
# extra-files entry is missing and customers would install a stale release.
ROOT="$ROOT" node - <<'EOF'
const fs = require("fs")
const root = process.env.ROOT
const pkgs = ["client-camunda7", "client-analytics", "widget-shell", "mcp-camunda7", "mcp-analytics"]
const versions = Object.fromEntries(
  pkgs.map((p) => [
    "@miragon-ai/" + p,
    JSON.parse(fs.readFileSync(`${root}/packages/${p}/package.json`, "utf8")).version,
  ]),
)
const bad = []
for (const file of ["server/package.json", "modules/mcp-notes/package.json"]) {
  const pj = JSON.parse(fs.readFileSync(`${root}/templates/composed-server/${file}`, "utf8"))
  for (const deps of [pj.dependencies ?? {}, pj.devDependencies ?? {}]) {
    for (const [name, pin] of Object.entries(deps)) {
      if (versions[name] && pin !== versions[name]) {
        bad.push(`${file}: ${name} pinned ${pin}, workspace is ${versions[name]}`)
      }
    }
  }
}
if (bad.length) {
  console.error(
    "Template pins drifted from the workspace versions (missing release-please extra-files entry?):\n" +
      bad.join("\n"),
  )
  process.exit(1)
}
EOF

# Build what the tarballs ship (files: dist [+ src]).
FILTERS=()
for p in "${PACKAGES[@]}"; do FILTERS+=("--filter" "@miragon-ai/$p"); done
pnpm --dir "$ROOT" exec turbo run build "${FILTERS[@]}"

for p in "${PACKAGES[@]}"; do
  mkdir -p "$PACK_DIR/$p"
  (cd "$ROOT/packages/$p" && pnpm pack --pack-destination "$PACK_DIR/$p" >/dev/null)
done

rsync -a --exclude node_modules --exclude dist --exclude .mcp-use "$TEMPLATE/" "$WORK/"

# Overrides beat both the template's direct pins and the transitive
# @miragon-ai/* ranges inside the packed packages.
{
  echo ""
  echo "overrides:"
  for p in "${PACKAGES[@]}"; do
    tgz=("$PACK_DIR/$p"/*.tgz)
    echo "  \"@miragon-ai/$p\": \"file:${tgz[0]}\""
  done
} >> "$WORK/pnpm-workspace.yaml"

cd "$WORK"
pnpm install --no-frozen-lockfile
pnpm build
pnpm typecheck
pnpm test

echo "test-template: OK"
