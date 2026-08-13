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

# Package directories under packages/; npm names come from each package.json.
PACKAGES=(
  core/widget-shell
  connectors/camunda/camunda7-client
  connectors/camunda/camunda7-connector
  connectors/analytics/analytics-client
  connectors/analytics/analytics-connector
)

pkg_name() { node -p "require('$ROOT/packages/$1/package.json').name"; }

# The template's committed @miragon-ai pins must match the workspace versions —
# release-please bumps both together via extra-files; a drifted pin means an
# extra-files entry is missing and customers would install a stale release.
# The toolkit family and mcp-use are checked too: they are pinned exactly
# across the workspace (save-exact; a drifted second instance resurrects the
# duplicate-React-context hang), but release-please does NOT bump them — a
# repo-wide toolkit/mcp-use bump must include the template by hand.
ROOT="$ROOT" node - <<'EOF'
const fs = require("fs")
const root = process.env.ROOT
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"))
const pkgDirs = [
  "core/widget-shell",
  "connectors/camunda/camunda7-client",
  "connectors/camunda/camunda7-connector",
  "connectors/analytics/analytics-client",
  "connectors/analytics/analytics-connector",
]
const versions = Object.fromEntries(
  pkgDirs
    .map((p) => read(`${root}/packages/${p}/package.json`))
    .map((pj) => [pj.name, pj.version]),
)
// The camunda7 connector declares toolkit-core (deps), toolkit-ui (devDeps)
// and mcp-use (peer + devDeps), so its pins are the canonical ones.
const camunda7 = read(`${root}/packages/connectors/camunda/camunda7-connector/package.json`)
for (const deps of [camunda7.dependencies, camunda7.peerDependencies, camunda7.devDependencies]) {
  for (const [name, pin] of Object.entries(deps ?? {})) {
    if (name.startsWith("@miragon/mcp-toolkit-") || name === "mcp-use") versions[name] = pin
  }
}
const bad = []
for (const file of ["server/package.json", "modules/mcp-notes/package.json"]) {
  const pj = read(`${root}/templates/composed-server/${file}`)
  for (const deps of [pj.dependencies, pj.devDependencies, pj.peerDependencies]) {
    for (const [name, pin] of Object.entries(deps ?? {})) {
      if (versions[name] && pin !== versions[name]) {
        bad.push(`${file}: ${name} pinned ${pin}, workspace is ${versions[name]}`)
      }
    }
  }
}
if (bad.length) {
  console.error(
    "Template pins drifted from the workspace versions (missing release-please extra-files " +
      "entry, or a toolkit/mcp-use bump that skipped the template?):\n" +
      bad.join("\n"),
  )
  process.exit(1)
}
EOF

# Build what the tarballs ship (files: dist [+ src]).
FILTERS=()
for p in "${PACKAGES[@]}"; do FILTERS+=("--filter" "$(pkg_name "$p")"); done
pnpm --dir "$ROOT" exec turbo run build "${FILTERS[@]}"

for p in "${PACKAGES[@]}"; do
  base="$(basename "$p")"
  mkdir -p "$PACK_DIR/$base"
  (cd "$ROOT/packages/$p" && pnpm pack --pack-destination "$PACK_DIR/$base" >/dev/null)
done

rsync -a --exclude node_modules --exclude dist --exclude .mcp-use "$TEMPLATE/" "$WORK/"

# Overrides beat both the template's direct pins and the transitive
# @miragon-ai/* ranges inside the packed packages.
{
  echo ""
  echo "overrides:"
  for p in "${PACKAGES[@]}"; do
    base="$(basename "$p")"
    tgz=("$PACK_DIR/$base"/*.tgz)
    echo "  \"$(pkg_name "$p")\": \"file:${tgz[0]}\""
  done
} >> "$WORK/pnpm-workspace.yaml"

cd "$WORK"
pnpm install --no-frozen-lockfile
pnpm build
pnpm typecheck
pnpm test

echo "test-template: OK"
