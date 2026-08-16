---
name: setup-server
description: Set up, configure, run, brand, and deploy this composed MCP server. Use whenever connecting a Camunda 7 / CIB Seven engine or Prometheus, selecting modules or toolsets (`MCP_ACTIVE_MODULES`), configuring persistence, renaming the `@acme` scope, building the Docker image, running behind an MCP gateway, or troubleshooting boot warnings, empty analytics, or inspector issues.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

# setup-server — from clone to running (and deployed) server

Configuration ground rules first:

- **`.env` is a `pnpm dev` convenience only** (loaded via dotenv-cli).
  `pnpm start` and the Docker image take their config from the environment.
- **`.env.example` documents every variable this server reads**, with defaults —
  it is the configuration reference, kept honest by
  `server/test/env-example.test.ts`.
- The server **warns at boot about unknown env vars** under any watched prefix
  (`MCP_`, `CAMUNDA_`, `PROMETHEUS_`, plus each custom module's prefix) — a
  boot warning means a typo or a var this build doesn't read, never noise.

## Step 1 — install and first run

```bash
pnpm install    # needs Node >= 22.22.2 (enforced at install time)
cp .env.example .env
pnpm dev        # MCP endpoint on :8400/mcp, inspector on :8400/mcp/inspector
```

Verify before configuring anything: open `http://localhost:8400/mcp/inspector` and
call `notes_show_notes` — the example module needs no external infrastructure,
so a rendered notes widget proves server, widget bundle, and inspector work.
Then read the boot log: every warning there is actionable (unknown env var,
missing Prometheus URL, engine auth problems).

## Step 2 — connect the engine and Prometheus

Edit `.env` (every field is documented inline in `.env.example`):

- `CAMUNDA_BASE_URL` — the engine REST endpoint.
- `CAMUNDA_ENGINE_ID` — **must match the `ENGINE_ID` the engine stamps onto its
  metrics.** The mismatch is silent: engine-scoped analytics (BPMN heatmap,
  engine compare) simply return nothing.
- `CAMUNDA_AUTH_TYPE` — `none | basic | bearer | passthrough`; `basic` needs
  `CAMUNDA_USERNAME`/`CAMUNDA_PASSWORD`, `bearer` needs `CAMUNDA_TOKEN` (both
  enforced at boot); `passthrough` forwards each MCP caller's own bearer token.
- `CAMUNDA_COCKPIT_URL` — set explicitly whenever the engine URL is not
  reachable from the user's browser (container hostname), otherwise "open in
  cockpit" links point nowhere.
- Multiple engines: `CAMUNDA_ENGINES_JSON` (or `CAMUNDA_ENGINES_FILE`) with
  per-engine `id`, `baseUrl`, optional `flavor` (`cibseven | operaton |
camunda7`) and `auth` — overrides the single-engine shorthand above.
- `PROMETHEUS_URL` — unset defaults to `http://localhost:9090`, which does
  **not** match the playground stack (host port 8460); every analytics query
  then fails. The server warns at boot when unset.

No engine at hand? The
[miragon-ai playground](https://github.com/Miragon/miragon-ai/tree/main/playground)
is a ready-made Docker Compose stack (engine + Prometheus + Grafana) whose
defaults match this template's `.env.example`.

## Step 3 — select modules and toolsets

`MCP_ACTIVE_MODULES` is a comma list; unset or `all` activates every module.
A `module:toolset` suffix narrows a module's tool surface:

```bash
MCP_ACTIVE_MODULES=camunda7:read-only,analytics,notes
```

- camunda7 supports `read-only | operations | admin`; analytics `read-only`.
- Unknown module names warn and are skipped; a toolset suffix on a module
  without toolsets warns and exposes all tools (fail-open).
- All widgets stay in the one Vite bundle regardless — inactive modules just
  register no tools. Module selection is runtime-only; there is no per-module
  bundle.

## Step 4 — persistence

Both stores default to **in-memory** — everything is lost on restart. For real
deployments point them at directories (mounted volumes in Docker):

```bash
MCP_PROFILE_DIR=./.data/profiles       # per-user settings (language, theme, module slices)
MCP_DASHBOARD_DIR=./.data/dashboards   # saved builder dashboards
MCP_PROFILE_SESSION_TTL_DAYS=30        # expiry for session-keyed records; 0 disables
```

OAuth, Postgres stores, and Redis session backends are deliberately trimmed
from this template — the stock server (`apps/mcp-server-camunda7` in the
[miragon-ai repo](https://github.com/Miragon/miragon-ai)) is the reference for
all three (README, "Going further").

## Step 5 — make it yours

Renaming the placeholder scope touches a fixed set of places — do all of them,
then reinstall so the lockfile matches:

1. `@acme/composed-mcp-server` in `server/package.json` (the `Dockerfile`
   selects packages by path — no edit there)
2. `@acme/mcp-notes` in `modules/mcp-notes/package.json`, in
   `server/package.json`'s dependencies, and in every import
   (`server/src/setup.ts`, `server/src/ui/widget-registry.ts`,
   `server/test/widget-registry.test.ts`)
3. the `acme-mcp` labels in `server/src/index.ts` and `setup.ts`
4. `pnpm install` to refresh `pnpm-lock.yaml` (the Docker build uses
   `--frozen-lockfile`)

Branding: swap the color tokens in `server/src/ui/globals.css` (the `:root` and
`.dark` blocks — light AND dark, they re-theme automatically). Neutrals come
from the toolkit's shadcn base; only the semantic severity ramp and accent
colors live here.

## Step 6 — Docker and production

```bash
pnpm install                    # once, then COMMIT pnpm-lock.yaml
docker build -t my-mcp-server .
docker run -p 8400:8400 \
  -e CAMUNDA_BASE_URL=http://host.docker.internal:8080/engine-rest \
  -e MCP_PROFILE_DIR=/data/profiles -v mcp-data:/data \
  my-mcp-server
```

- Config comes from the environment — the image does not read `.env`.
- `PORT` sets the HTTP port (default 8400); `MCP_URL` is the public base URL
  when running behind a proxy or MCP gateway.
- Federation/aggregation across MCP servers belongs in an external gateway
  (e.g. agentgateway) IN FRONT of this server — this repo builds one
  self-contained server; don't add upstream/proxy mechanics to it.

## Step 7 — verify

```bash
pnpm build && pnpm typecheck && pnpm test
```

Then a functional pass in the inspector: `camunda7_engine` (engine reachable,
auth works), one `camunda7_show_*` widget, one analytics tool (Prometheus
reachable, `engine_id` matches). A clean boot log — no unknown-var or
missing-URL warnings — is part of done. To test against a real ChatGPT/Claude
host, `mcp-use dev --tunnel` (from `server/`) exposes the local server through
a public tunnel.

## Troubleshooting

| Symptom                                   | Cause                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every in-widget query hangs on "Loading…" | `resolve.dedupe` in `server/vite.config.ts` was trimmed, or a second copy of React/toolkit/mcp-use got installed                                  |
| Widgets render unstyled                   | widget sources outside the Tailwind scan set (workspace modules are globbed; npm-installed ones need an `@source` in `server/src/ui/globals.css`) |
| Analytics tools return empty results      | `CAMUNDA_ENGINE_ID` doesn't match the engine's metrics `ENGINE_ID`, or `PROMETHEUS_URL` points at the wrong port                                  |
| "Unknown environment variable" at boot    | typo, or a var this build doesn't read — `.env.example` is the authoritative list                                                                 |
| Widget UI changes don't show up           | the bundle is read once at boot — restart `pnpm dev` at the repo root (it rebuilds modules + bundle on start)                                     |
| A tool is missing                         | module not in `MCP_ACTIVE_MODULES`, or a toolset suffix (`:read-only`) filtered it                                                                |
