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

| Path                         | Contents                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mcp-server-camunda7/`  | The MCP host: composes plugins, bundles the widget UI, serves HTTP on `:8400`                                                                                   |
| `packages/mcp-camunda7/`     | camunda7 module: operations tools, widget tools, widgets, pipeline steps                                                                                        |
| `packages/mcp-analytics/`    | analytics module: Prometheus-backed tools, dashboards, comparison widgets                                                                                       |
| `packages/client-camunda7/`  | Generated CIB Seven REST SDK (`src/generated/`) + Zod input schemas (`src/schemas/`)                                                                            |
| `packages/client-analytics/` | Prometheus client + PromQL query functions (`src/queries/`) + Zod schemas                                                                                       |
| `packages/widget-shell/`     | Shared widget kit: UI primitives incl. `useApplyTheme` (`/widgets`), `adaptDataWidget` (`/ui`), view + data-feed builders + the `shell:*` catalogue (`/server`) |
| `engine-plugins/`            | Kotlin/Gradle: CIB Seven OTEL metrics plugin (Java 21)                                                                                                          |
| `playground/`                | Demo env: CIB Seven showcase engine, Compose stack, Fly.io deploy                                                                                               |
| `docs/`                      | VitePress docs site (see the `docs-style` skill before editing)                                                                                                 |

## Commands

```bash
export GITHUB_TOKEN=ghp_xxx          # PAT with read:packages — REQUIRED before install:
pnpm install --frozen-lockfile       # @miragon/* resolves via npm.pkg.github.com (.npmrc)

pnpm build                           # turbo build across the monorepo (runs `generate` first)
pnpm typecheck                       # tsc --noEmit everywhere, incl. widget/UI tsconfigs
pnpm test                            # vitest across the workspace
pnpm lint                            # eslint per package (`pnpm lint:fix` to autofix)
pnpm format:check                    # prettier check (`pnpm format` to write)
pnpm generate                        # regenerate the CIB Seven SDK from the OpenAPI spec

# Run the server locally (needs the Docker infra + a .env file, see .env.example):
docker compose -f playground/docker/docker-compose.yml up -d
pnpm dev                             # MCP server on :8400

# Kotlin engine plugins (Java 21):
cd engine-plugins && ./gradlew build # compile + unit tests + Konsist architecture tests

# Docs site:
pnpm docs:dev                        # local dev server; pnpm docs:build to build
```

`pnpm dev` serves the MCP endpoint at `http://localhost:8400/mcp` and the `mcp-use`
inspector UI at `http://localhost:8400/inspector` — use the inspector to call tools and
render widgets manually.

If generated SDK files look wrong (e.g. `client.gen.ts` importing `./src/hey-api.js`
instead of `../hey-api.js`), the shared turbo cache replayed a poisoned `generate`
output — fix with `pnpm exec turbo run generate --filter=@miragon-ai/client-camunda7 --force`.

## Architecture invariants

1. **New operations tools go through the registrar — never raw `server.tool()`.** Add the
   Zod input schema in `packages/client-camunda7/src/schemas/`, then register the tool in
   `packages/mcp-camunda7/src/tools/<domain>.ts` via the `register` callback created by
   `createToolRegistrar` (wired in `src/tools/index.ts`). Every registrar tool carries a
   `category` matching its domain file (e.g. `"process-instances"`, `"tasks"`;
   `"analytics"` for the analytics module). Spread `...engineParamShape` into the input
   schema and wrap the handler in `withEngine(...)` (both from `src/lib/with-engine.ts`).
   See `camunda7_list_process_instances` in
   `packages/mcp-camunda7/src/tools/process-instances.ts` for the canonical shape.
   Destructive/admin tools must also be listed in `src/lib/toolsets.ts` (`ADMIN_ONLY_TOOLS`)
   so the `camunda7:read-only|operations|admin` toolset filtering stays correct —
   `src/lib/toolsets.test.ts` enforces the rule structurally over every registered tool
   (`destructiveHint` ⇒ admin-only, read-only ⇒ `readOnlyHint`), so get the annotations
   right rather than editing the test. Tools registered outside the registrar (the
   widget-tools path) that perform durable writes must honor the toolset themselves —
   pattern: `camunda7_save_user_profile` in `src/tools/user-profile.ts`.

2. **Never talk to an engine directly.** All engine access goes through
   `resolveEngine`/`withEngine` (`packages/mcp-camunda7/src/lib/`), which implements the
   multi-engine routing precedence: per-call `engine` override > sticky session selection
   (`camunda7_engine`, action `"select"`) > the single configured default. Constructing or
   caching a client yourself breaks multi-engine routing. `resolveEngine` already returns
   `baseUrl`/`cockpitUrl` — never fish them out of `registry.engines` yourself.

3. **Widget registration is a four-link chain** — a widget that misses a link is silently
   absent somewhere:
   - `packages/mcp-camunda7/src/widgets/registry.ts` — component → dataType via `adaptDataWidget`
   - `packages/mcp-camunda7/src/definition.ts` — widget metadata (`id`, `requires`, `size`, `propsSchema`)
   - `apps/mcp-server-camunda7/src/ui/widget-registry.ts` — the host bundle map (spreads
     `camunda7Widgets`/`analyticsWidgets`; verify your widget actually arrives there)
   - `packages/mcp-camunda7/src/tool-names.ts` — the tool-name constant for every
     `show_*`/`*_data` tool, so in-widget navigation stays rename-safe

   Links 1↔2 are guarded by `src/widgets/catalogue-sync.test.ts` (both modules have
   one); link 3 you still verify by hand.

4. **The `dedupe` array in `apps/mcp-server-camunda7/vite.config.ts` is load-bearing — never
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
     host instead of returned to the in-widget `callTool()`. Feeds return
     `buildDataFeedResult(data)` from `@miragon-ai/widget-shell/server` — the single
     implementation of this invariant

6. **Widgets compose from the shared kit (`@miragon-ai/widget-shell/widgets`) — never
   re-inline its primitives.** `ViewDataState` for the loading/error/no-data guard;
   `QueryFallback` + `TableSkeleton` for self-fetching widgets (a missing `isError`
   branch means an eternal skeleton); `formatTimestamp`/`formatDate`/`formatTime`/
   `formatDuration`/`truncate` for all formatting (canonical duration style "3m 7s");
   `Section`, `Th`/`Td`/`TableEmptyState`, `WidgetHeader` + `VersionChip`, `KpiGrid`,
   `WidgetShell` for structure; `useBpmnViewer` + `BpmnZoomControls` for BPMN, with
   highlight/legend colors from `HIGHLIGHT_COLORS`
   (`packages/mcp-camunda7/src/widgets/bpmn-highlights.ts`).

7. **Shared server data paths are single-sourced.** Definition name/version/instance
   lookups come from `packages/mcp-camunda7/src/data/definition-info.ts`;
   `data/bpmn-viewer-data.ts` feeds BOTH the widget tool and the pipeline step — never
   fork them. Analytics periods derive from `PERIODS`/`PERIOD_RANGE` (client-analytics)
   — no hardcoded enum copies (the copy in `mcp-camunda7/src/lib/profile-constants.ts`
   is a deliberate module-boundary exception).

8. **Modules are self-contained peers; the app is a thin composition root.**
   `mcp-*` packages never import each other. Each module exports its definition in
   `src/module.ts` (config schema, `configFromEnv`, `knownEnvVars`, `bootWarnings`,
   plugin factory) conforming structurally to the app-owned port in
   `apps/mcp-server-camunda7/src/module-contract.ts`; the app's `setup.ts` only selects
   modules (`MCP_ACTIVE_MODULES`) and wires `SharedResources` (profile store +
   `fetchBpmnXml` — the camunda7 BPMN-XML lookup injected into the analytics heatmap;
   analytics has NO engine-SDK dependency). Apps own no domain UI: widget catalogues and
   components live in packages. Cross-module UI is tiered: `shell:*` widgets via
   `props.dataKey`; raw tool-name strings with graceful degradation (reference:
   `process-detail.tsx` → `analytics_bpmn_heatmap_data`); hard-composed views go in a
   dedicated package created with the first real view — never in the app, never as
   module-to-module imports. Engine _vendors_ (CIB Seven, Operaton, Camunda 7) are
   per-engine runtime config (`flavor` → `EngineProvider` in
   `packages/mcp-camunda7/src/providers/` — the port holds ONLY real differences:
   cockpit routes, branding, client hook; never an SDK mirror), never separate apps; a different _dialect_ (Flowable)
   would be a new module + client + app. Extract shared packages on the second concrete
   consumer, never speculatively.

## Contracts

- **`packages/client-analytics/metrics-contract.json` is the single source of truth for
  metric names and labels — when changing a metric, change it here first.** The Kotlin
  plugin (`engine-plugins/cibseven-history-metrics/.../ProcessMetrics.kt`,
  `EngineStateMetrics.kt`) emits the OTEL instruments (`otelName`) that surface in
  Prometheus as `camunda_*` series (`promName`, e.g. `camunda.activity.ended` →
  `camunda_activity_ended_total`). Consumers — the TS queries (via `METRIC_NAMES` in
  `packages/client-analytics/src/metric-names.ts`, never raw strings), the alert rules
  (`playground/docker/prometheus/alerts.yml`), and the Grafana dashboards
  (`playground/docker/grafana/dashboards/*.json`) — are checked against the contract by tests on
  both sides: `packages/client-analytics/src/metrics-contract.test.ts` (vitest — also
  covers the Grafana dashboards incl. regex matchers, per-metric `sum by (…)` grouping
  labels, and a dead-entry check with a documented allowlist) and
  `engine-plugins/cibseven-history-metrics/.../MetricsContractTest.kt` (Gradle — also
  checks the label keys each instrument attaches). A rename that skips the contract or
  a consumer fails one of them; don't weaken these guards to make a change pass. Only
  attach model-bounded labels (definition key, activity id, engine id …) — never
  instance ids, business keys, or variable values.
- **`@miragon/mcp-toolkit-*` is pinned exactly** (`save-exact=true` in `.npmrc`, currently
  `0.9.0` everywhere). Updates are deliberate version bumps across all packages — never
  loosen the pin or bump a single package in isolation.
- **The widget `_meta` contract comes from the toolkit — never hand-write the
  dual-protocol keys.** `uiMeta({ resourceUri, title, … })` emits the full ext-apps/Apps
  SDK contract (`ui/resourceUri`, `openai/outputTemplate`, `openai/toolInvocation/*`,
  `openai/widgetAccessible`, `openai/resultCanProduceWidget`) for widget-rendering
  tools; app-only `*_data` feeds stay free of those keys on purpose. Guarded by
  `apps/mcp-server-camunda7/test/widget-meta.test.ts` (unit) and
  `apps/mcp-server-camunda7/test/widget-contract.e2e.test.ts` (on the wire, **by name**: every
  `*_show_*` tool must carry the widget `_meta`, every `*_data` feed must be app-only —
  the naming convention is load-bearing; don't weaken the name checks).
- **Federation/aggregation happens in an external MCP gateway (agentgateway) IN FRONT of
  this server; this repo builds one self-contained MCP server including its UI.** No
  upstream/proxy mechanics in the code (the `proxies: []` in `src/index.ts` stays empty
  until the toolkit drops the option). The generic `shell:kpi-grid`/`shell:data-table`
  widgets (catalogue + components in `@miragon-ai/widget-shell`) are always registered — they are the
  standard `render-view`/builder composition targets for KPI rows/tables, fed via
  `props.dataKey`.

## Releases & toolkit contributions

- **Everything releases through one release-please train.** Conventional commits on
  `main` drive `release-please.yml`, which opens/updates a single Release PR (root
  component, tag `v<version>`); release-please bumps the root, the server app,
  client-camunda7 and client-analytics `package.json`s plus
  `engine-plugins/gradle.properties` in lockstep (`extra-files` in
  `release-please-config.json`). Merging the PR creates the release; the publish
  workflows then wait for manual approval of the `release` environment gate.
- **No npm publish exists today.** `client-camunda7`/`client-analytics` carry a
  `publishConfig` for npm.pkg.github.com (`access: restricted`) but no CI job publishes
  them; the server app, widget-shell, mcp-camunda7 and mcp-analytics are `"private": true`.
  Don't flip `private` or add a publish job without the distribution decision (#118).
- **Engine plugins publish via `publish-to-maven.yml`** (called from the release train):
  `./gradlew publish` against GitHub Packages Maven. All engine plugins share the umbrella
  group `ai.miragon.mcp` with the engine carried in the artifactId (`<engine>-<artifact>`);
  the cibseven metrics plugin publishes as `ai.miragon.mcp:cibseven-history-metrics`
  (shadow jar).
- **The server image publishes via `publish-to-docker.yml`** (same train): builds the
  root `Dockerfile` and pushes `docker.io/miragon/miragon-ai-server:<version>` and
  `:latest` to Docker Hub (version = release tag without the `v` prefix, falling back
  to `apps/mcp-server-camunda7/package.json`).
- **`@miragon/mcp-toolkit-*` lives in a separate repository** and is consumed here as an
  exactly pinned dependency (`save-exact`, currently `0.9.0`). Toolkit changes happen in
  that repo and arrive here as a deliberate, repo-wide version bump — and since the
  toolkit is `0.x`, treat every minor bump as potentially breaking.
- **Validating unreleased toolkit changes:** build + `pnpm pack` the toolkit packages,
  point temporary `overrides` in `pnpm-workspace.yaml` at the `file:` tarballs (park any
  `patchedDependencies` entry for the same package while doing so), run the full bar plus
  `test:host`, then revert the workspace yaml + lockfile. Never commit the overrides.

## Verification — what each check actually covers

| Check             | Coverage                                                                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm build`      | tsc emit of server code + the server app's Vite widget bundle (`build:ui`); excludes widget `.tsx` type errors in packages                                                                                                                             |
| `pnpm typecheck`  | **The only check that type-checks widget code** — `tsc -p tsconfig.widgets.json` in mcp-camunda7/mcp-analytics, `tsc -p tsconfig.ui.json` in the server app                                                                                            |
| `pnpm test`       | Vitest unit tests (lib + query logic) **plus** the server app e2e smoke + widget wire-contract tests (in-process boot, loopback HTTP); **no widget rendering**                                                                                         |
| `pnpm lint`       | ESLint over each package's `src` (the server app also `test`/`test-host`)                                                                                                                                                                              |
| `./gradlew build` | Kotlin compile + unit tests + Konsist architecture tests (run in `engine-plugins/`)                                                                                                                                                                    |
| `test:host`       | `pnpm --filter @miragon-ai/mcp-server-camunda7 test:host` — Playwright host simulation of the **built** widget bundle (SEP-1865 shim; structuredContent keep/strip scenarios); required for changes to the widget shell, `src/ui/`, or the toolkit pin |
| Manual            | `docker compose -f playground/docker/docker-compose.yml up -d` + `pnpm dev`, then exercise tools/widgets via the inspector at `http://localhost:8400/inspector`                                                                                        |

A green `pnpm build && pnpm typecheck && pnpm test && pnpm lint` is the minimum bar for
every change; widget changes additionally need `test:host` plus a manual render check via
the inspector (real widget data paths are not covered by the host simulation's fixture).
