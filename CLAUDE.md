# CLAUDE.md

Guidance for AI agents working in this repository. The repo-specific skills
`.claude/skills/add-bpm-feature` and `.claude/skills/add-analytics-feature` contain
step-by-step walkthroughs for the two main feature paths — read them before adding tools,
queries, or widgets.

## What this repo is

"Automation MCP" — a pnpm + Turbo monorepo that ships an MCP server (built on `mcp-use`
plus the private `@miragon/mcp-toolkit-*` packages) for Camunda 7 / CIB Seven BPM
operations and Prometheus-backed process analytics, including interactive React widgets
(MCP Apps).

| Path                          | Contents                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `apps/mcp-gateway/`           | The MCP host: composes plugins, bundles the widget UI, serves HTTP on `:8400`          |
| `packages/mcp-cibseven/`      | camunda7 module: operations tools, widget tools, widgets, pipeline steps               |
| `packages/mcp-analytics/`     | analytics module: Prometheus-backed tools, dashboards, comparison widgets              |
| `packages/client-cibseven/`   | Generated CIB Seven REST SDK (`src/generated/`) + Zod input schemas (`src/schemas/`)   |
| `packages/client-analytics/`  | Prometheus client + PromQL query functions (`src/queries/`) + Zod schemas              |
| `packages/widget-shell/`      | Shared widget plumbing: `adaptDataWidget`, `buildSingleWidgetView`/`buildComposedView` |
| `engine-plugins/`             | Kotlin/Gradle: CIB Seven OTEL metrics + event-bridge plugins (Java 21)                 |
| `examples/miravelo-upstream/` | Federated upstream example implementing the proxy-contract manifest                    |
| `docker/`                     | Compose stack: CIB Seven engines, OTEL Collector, Prometheus, Grafana, Jaeger          |
| `docs/`                       | VitePress docs site (see the `docs-style` skill before editing)                        |

## Commands

```bash
export GITHUB_TOKEN=ghp_xxx          # PAT with read:packages — REQUIRED before install:
pnpm install --frozen-lockfile       # @miragon/* resolves via npm.pkg.github.com (.npmrc)

pnpm build                           # turbo build across the monorepo (runs `generate` first)
pnpm typecheck                       # tsc --noEmit everywhere, incl. widget/UI tsconfigs
pnpm test                            # vitest (packages with tests: mcp-cibseven, client-analytics)
pnpm lint                            # eslint per package (`pnpm lint:fix` to autofix)
pnpm format:check                    # prettier check (`pnpm format` to write)
pnpm generate                        # regenerate the CIB Seven SDK from the OpenAPI spec

# Run the server locally (needs the Docker infra + a .env file, see .env.example):
docker compose -f docker/docker-compose.yml up -d
pnpm dev                             # miravelo example upstream + MCP gateway on :8400

# Kotlin engine plugins (Java 21):
cd engine-plugins && ./gradlew build # compile + unit tests + Konsist architecture tests

# Docs site:
pnpm docs:dev                        # local dev server; pnpm docs:build to build
```

`pnpm dev` serves the MCP endpoint at `http://localhost:8400/mcp` and the `mcp-use`
inspector UI at `http://localhost:8400/inspector` — use the inspector to call tools and
render widgets manually.

## Architecture invariants

1. **New operations tools go through the registrar — never raw `server.tool()`.** Add the
   Zod input schema in `packages/client-cibseven/src/schemas/`, then register the tool in
   `packages/mcp-cibseven/src/tools/<domain>.ts` via the `register` callback created by
   `createToolRegistrar` (wired in `src/tools/index.ts`). Spread `...engineParamShape`
   into the input schema and wrap the handler in `withEngine(...)` (both from
   `src/lib/with-engine.ts`). See `camunda7_list_process_instances` in
   `packages/mcp-cibseven/src/tools/process-instances.ts` for the canonical shape.

2. **Never talk to an engine directly.** All engine access goes through
   `resolveEngine`/`withEngine` (`packages/mcp-cibseven/src/lib/`), which implements the
   multi-engine routing precedence: per-call `engine` override > sticky session selection
   (`camunda7_select_engine`) > the single configured default. Constructing or caching a
   client yourself breaks multi-engine routing.

3. **Widget registration is a four-link chain** — a widget that misses a link is silently
   absent somewhere:
   - `packages/mcp-cibseven/src/widgets/registry.ts` — component → dataType via `adaptDataWidget`
   - `packages/mcp-cibseven/src/definition.ts` — widget metadata (`id`, `requires`, `size`, `propsSchema`)
   - `apps/mcp-gateway/src/ui/widget-registry.ts` — the host bundle map (spreads
     `camunda7Widgets`/`analyticsWidgets`; verify your widget actually arrives there)
   - `packages/mcp-cibseven/src/tool-names.ts` — the tool-name constant for every
     `show_*`/`*_data` tool, so in-widget navigation stays rename-safe

4. **The `dedupe` array in `apps/mcp-gateway/vite.config.ts` is load-bearing — never
   remove or trim it.** Without it each widget package bundles its own React/toolkit
   instance, the React contexts no longer match, `useCallTool()` is undefined, and every
   in-widget query hangs on "Loading…".

5. **There are three render paths — pick deliberately:**
   - Registrar tools (`src/tools/`): plain JSON data _for the model_
   - Widget tools (`widget-tools.ts`, `show_*`, `_meta: { ui: { resourceUri } }`):
     render a widget for the user + return a summary for the model
   - `*_data` feeds (also in `widget-tools.ts`, `_meta: { ui: { visibility: ["app"] } }`,
     **no** `resourceUri`): app-only JSON for in-widget refresh/navigation — SEP-1865
     hosts hide them from the LLM, and a widget-tool result would be rendered by the
     host instead of returned to the in-widget `callTool()`

## Contracts

- **Metric names are a four-place contract.** The Kotlin plugin
  (`engine-plugins/cibseven-history-metrics/.../ProcessMetrics.kt`) emits OTEL
  instruments that surface in Prometheus as `camunda_*` series (e.g.
  `camunda.activity.ended` → `camunda_activity_ended_total`). Those names are consumed
  by the TS queries (`packages/client-analytics/src/queries/*`), the alert rules
  (`docker/prometheus/alerts.yml`), and the Grafana dashboard
  (`docker/grafana/dashboards/process-analytics.json`). Changing a metric means changing
  **all four** places. Only attach model-bounded labels (definition key, activity id,
  engine id …) — never instance ids, business keys, or variable values.
- **`@miragon/mcp-toolkit-*` is pinned exactly** (`save-exact=true` in `.npmrc`, currently
  `0.3.1` everywhere). Updates are deliberate version bumps across all packages — never
  loosen the pin or bump a single package in isolation.
- **The proxy-contract manifest is the federation contract to upstreams.** Upstream MCP
  servers expose `get-module-manifest` (validated by `ModuleManifestSchema` from
  `@miragon/mcp-toolkit-proxy-contract`) to contribute steps and widgets; the gateway
  discovers them via `MCP_PROXIES` (`parseProxyConfigEnv`). See
  `examples/miravelo-upstream/server.ts` for the reference implementation.

## Verification — what each check actually covers

| Check             | Coverage                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`      | tsc emit of server code + the gateway's Vite widget bundle (`build:ui`); excludes widget `.tsx` type errors in packages                                  |
| `pnpm typecheck`  | **The only check that type-checks widget code** — `tsc -p tsconfig.widgets.json` in mcp-cibseven/mcp-analytics, `tsc -p tsconfig.ui.json` in the gateway |
| `pnpm test`       | Vitest unit tests (lib + query logic); **no widget rendering, no HTTP**                                                                                  |
| `pnpm lint`       | ESLint over each package's `src`                                                                                                                         |
| `./gradlew build` | Kotlin compile + unit tests + Konsist architecture tests (run in `engine-plugins/`)                                                                      |
| Manual            | `docker compose -f docker/docker-compose.yml up -d` + `pnpm dev`, then exercise tools/widgets via the inspector at `http://localhost:8400/inspector`     |

A green `pnpm build && pnpm typecheck && pnpm test && pnpm lint` is the minimum bar for
every change; widgets additionally need a manual render check via the inspector since no
automated check renders them.
