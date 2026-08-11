# Composed MCP server template

Build your own MCP server from the published `@miragon-ai` modules plus your own
custom modules. This template composes three modules — `camunda7` and
`analytics` from npm, and one example custom module (`modules/mcp-notes`) that
shows the full house pattern: plain tools, a widget tool, an app-only data
feed, a React widget, and the guard tests that keep them consistent.

Everything installs from the public npm registry — no registry credentials
needed.

## Quickstart

```bash
pnpm install
cp .env.example .env  # engine + Prometheus URLs; `pnpm dev` loads it
pnpm build            # builds the module, the widget bundle, and the server
pnpm dev              # MCP endpoint on :8400, inspector on :8400/inspector
```

Point the inspector (or any MCP host) at `http://localhost:8400/mcp` and call
`notes_show_notes` to see the example widget. The camunda7/analytics tools need
a running engine/Prometheus — see the [miragon-ai playground](https://github.com/Miragon/miragon-ai/tree/main/playground)
for a ready-made Docker Compose stack.

Make it yours: rename the `@acme` scope in `server/package.json`,
`modules/mcp-notes/package.json`, the imports, and the
`--filter @acme/composed-mcp-server` in the `Dockerfile` deploy step; then
re-run `pnpm install` to refresh `pnpm-lock.yaml` (the Docker build uses
`--frozen-lockfile`). Finally swap the brand tokens in
`server/src/ui/globals.css`.

## Layout

| Path                            | Contents                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/`                       | The composition root: module selection, shared resources, widget bundle                                                                            |
| `server/src/setup.ts`           | `MODULES` list, env handling, `SharedResources` wiring                                                                                             |
| `server/src/module-contract.ts` | The port every module satisfies (structurally — modules never import it)                                                                           |
| `server/src/ui/`                | The single widget bundle: registry, providers, theme                                                                                               |
| `server/test/`                  | Guard tests — keep these; the wire-contract test covers your modules by naming convention, `widget-registry.test.ts` needs your `definition` added |
| `modules/mcp-notes/`            | Example custom module: tools + widget + catalogue + sync test                                                                                      |

## Adding your own module

A module is a package that exports a `ModuleDefinition` (see
`server/src/module-contract.ts`): a `name`, a pure `configFromEnv`,
`knownEnvVars`, `supportsToolsets`, optional `bootWarnings`, and a
`createPlugin(config, shared)` factory. Copy `modules/mcp-notes` and adjust.

Wiring a module into the server touches these places (plus the `workspace:*`
dependency in `server/package.json`):

1. `MODULES` in `server/src/setup.ts`
2. the widget spread in `server/src/ui/widget-registry.ts`
3. a Tailwind `@source` entry for the module's widget sources in
   `server/src/ui/globals.css` (missing = silently unstyled widgets)
4. the module's `definition` in `server/test/widget-registry.test.ts` — so the
   guard actually covers your module

The failure modes of a forgotten widget entry are **silent** (tools work,
widgets render empty or unstyled) — that is exactly what the guard tests are
for.

### The four-link widget chain

Every widget must appear in four places, or it is silently absent somewhere:

1. the module's component map (`src/widgets/index.ts`)
2. the module's catalogue (`src/definition.ts`) — links 1↔2 guarded by the
   module's `catalogue-sync.test.ts`
3. the server's `widget-registry.ts` — guarded by `widget-registry.test.ts`
4. the module's `tool-names.ts` constant for every `show_*`/`*_data` tool
   referenced from widget code

### The three render paths

- **Plain tools** (`src/tools.ts`, via `createToolRegistrar`): JSON for the
  model.
- **Widget tools** (`*_show_*`, a `view` binding named after the tool +
  `_meta: appsSdkMeta({ resourceUri: viewResourceUri(name), title })`): render
  a widget for the user, return a summary for the model.
- **Data feeds** (`*_data`, `visibility: "app"` +
  `_meta: { "openai/widgetAccessible": true }`, result via
  `buildDataFeedResult`): app-only JSON for in-widget refresh/self-fetch —
  hosts hide them from the model.

The `_show_`/`_data` **naming is load-bearing**: the wire-level test
(`server/test/widget-contract.e2e.test.ts`) asserts the widget `_meta` contract
by name across ALL composed modules, including yours.

## Invariants you must not break

- **`resolve.dedupe` in `server/vite.config.ts` is load-bearing.** Without it,
  each widget package bundles its own React/toolkit instance, the React
  contexts no longer match, and every in-widget query hangs on "Loading…".
- **One deduped Vite bundle.** All widgets compile into one two-file bundle
  (`dist/mcp-app.js` + `dist/mcp-app.css`, served through mcp-use 2's
  `app.bundle` views); modules cannot be loaded at runtime.
  `MCP_ACTIVE_MODULES` selects modules at runtime — all widgets stay bundled,
  inactive modules just register no tools.
- **Exact version pins** (`save-exact` in `.npmrc`). Upgrade all `@miragon-ai/*`
  packages together to one version; treat every `@miragon/mcp-toolkit-*` minor
  as potentially breaking (0.x) and keep it at the version the `@miragon-ai`
  packages pin.
- **Tailwind `@source` entries in `server/src/ui/globals.css`** must cover every
  module's widget sources — a missing entry renders unstyled widgets with no
  build error.

## Configuration

[`.env.example`](.env.example) documents every variable this server reads, with
defaults; copy it to `.env`, which `pnpm dev` loads via `dotenv-cli`. It is not
read by `pnpm start` or the Docker image — those take their config from the
environment. A variable the server does not read prints an "Unknown environment
variable" warning at boot, so keep `.env.example` in sync when you add a module
(guarded by `server/test/env-example.test.ts`).

| Variable                                     | Effect                                                           |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `PORT`                                       | HTTP port (default 8400)                                         |
| `MCP_URL`                                    | Public base URL (behind a proxy/gateway)                         |
| `MCP_ACTIVE_MODULES`                         | Comma list, e.g. `camunda7:read-only,notes` (default: all)       |
| `MCP_PROFILE_DIR`                            | Filesystem persistence for user profiles (default: in-memory)    |
| `MCP_PROFILE_SESSION_TTL_DAYS`               | Expiry for session-keyed profile records (default 30, `0` = off) |
| `MCP_DASHBOARD_DIR`                          | Filesystem persistence for saved dashboards (default: in-memory) |
| `CAMUNDA_*`, `PROMETHEUS_URL`, `NOTES_TITLE` | Module config — each module documents its own `knownEnvVars`     |

## Docker

```bash
pnpm install          # once, then commit pnpm-lock.yaml
docker build -t my-mcp-server .
docker run -p 8400:8400 -e CAMUNDA_BASE_URL=http://host.docker.internal:8080/engine-rest my-mcp-server
```

## Deliberately trimmed vs. the stock server

The stock server (`apps/mcp-server-camunda7` in the
[miragon-ai repo](https://github.com/Miragon/miragon-ai)) additionally ships,
and is the reference for:

- **OAuth** (Keycloak/Auth0/OIDC resource-server mode) — `src/oauth.ts`
- **Postgres** profile/dashboard stores + migrations and **Redis** MCP-session
  backends for multi-instance — `src/persistence/`
- **Playwright host simulation** of the built widget bundle — `test-host/`
