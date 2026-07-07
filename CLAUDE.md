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
| `engine-plugins/`             | Kotlin/Gradle: CIB Seven OTEL metrics plugin (Java 21)                                 |
| `examples/miravelo-upstream/` | Federated upstream example implementing the proxy-contract manifest                    |
| `docker/`                     | Compose stack: CIB Seven engines, OTEL Collector, Prometheus, Grafana                  |
| `docs/`                       | VitePress docs site (see the `docs-style` skill before editing)                        |

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
   `createToolRegistrar` (wired in `src/tools/index.ts`). Every registrar tool carries a
   `category` matching its domain file (e.g. `"process-instances"`, `"tasks"`;
   `"analytics"` for the analytics module). Spread `...engineParamShape` into the input
   schema and wrap the handler in `withEngine(...)` (both from `src/lib/with-engine.ts`).
   See `camunda7_list_process_instances` in
   `packages/mcp-cibseven/src/tools/process-instances.ts` for the canonical shape.
   Destructive/admin tools must also be listed in `src/lib/toolsets.ts` (`ADMIN_ONLY_TOOLS`)
   so the `camunda7:read-only|operations|admin` toolset filtering stays correct.

2. **Never talk to an engine directly.** All engine access goes through
   `resolveEngine`/`withEngine` (`packages/mcp-cibseven/src/lib/`), which implements the
   multi-engine routing precedence: per-call `engine` override > sticky session selection
   (`camunda7_engine`, action `"select"`) > the single configured default. Constructing or
   caching a client yourself breaks multi-engine routing.

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

- **`packages/client-analytics/metrics-contract.json` is the single source of truth for
  metric names and labels — when changing a metric, change it here first.** The Kotlin
  plugin (`engine-plugins/cibseven-history-metrics/.../ProcessMetrics.kt`,
  `EngineStateMetrics.kt`) emits the OTEL instruments (`otelName`) that surface in
  Prometheus as `camunda_*` series (`promName`, e.g. `camunda.activity.ended` →
  `camunda_activity_ended_total`). Consumers — the TS queries (via `METRIC_NAMES` in
  `packages/client-analytics/src/metric-names.ts`, never raw strings), the alert rules
  (`docker/prometheus/alerts.yml`), and the Grafana dashboards
  (`docker/grafana/dashboards/*.json`) — are checked against the contract by tests on
  both sides: `packages/client-analytics/src/metrics-contract.test.ts` (vitest) and
  `engine-plugins/cibseven-history-metrics/.../MetricsContractTest.kt` (Gradle). A
  rename that skips the contract or a consumer fails one of them. Only attach
  model-bounded labels (definition key, activity id, engine id …) — never instance ids,
  business keys, or variable values.
- **`@miragon/mcp-toolkit-*` is pinned exactly** (`save-exact=true` in `.npmrc`, currently
  `0.8.0` everywhere). Updates are deliberate version bumps across all packages — never
  loosen the pin or bump a single package in isolation.
- **The widget `_meta` contract comes from the toolkit — never hand-write the
  dual-protocol keys.** `uiMeta({ resourceUri, title, … })` emits the full ext-apps/Apps
  SDK contract (`ui/resourceUri`, `openai/outputTemplate`, `openai/toolInvocation/*`,
  `openai/widgetAccessible`, `openai/resultCanProduceWidget`) for widget-rendering
  tools; app-only `*_data` feeds stay free of those keys on purpose. Guarded by
  `apps/mcp-gateway/test/widget-meta.test.ts` (unit) and
  `apps/mcp-gateway/test/widget-contract.e2e.test.ts` (on the wire).
- **The proxy-contract manifest is the federation contract to upstreams.** Upstream MCP
  servers expose `get-module-manifest` (validated by `ModuleManifestSchema` from
  `@miragon/mcp-toolkit-proxy-contract`) to contribute steps and widgets; the gateway
  discovers them via `MCP_PROXIES` (`parseProxyConfigEnv`). See
  `examples/miravelo-upstream/server.ts` for the reference implementation.

## Releases & toolkit contributions

- **Everything releases through one release-please train.** Conventional commits on
  `main` drive `release-please.yml`, which opens/updates a single Release PR (root
  component, tag `v<version>`); release-please bumps the root, gateway,
  client-cibseven and client-analytics `package.json`s plus
  `engine-plugins/gradle.properties` in lockstep (`extra-files` in
  `release-please-config.json`). Merging the PR creates the release; the publish
  workflows then wait for manual approval of the `release` environment gate.
- **No npm publish exists today.** `client-cibseven`/`client-analytics` carry a
  `publishConfig` for npm.pkg.github.com (`access: restricted`) but no CI job publishes
  them; the gateway, widget-shell, mcp-cibseven and mcp-analytics are `"private": true`.
  Don't flip `private` or add a publish job without the distribution decision (#118).
- **Engine plugins publish via `publish-to-maven.yml`** (called from the release train):
  `./gradlew publish` against GitHub Packages Maven. All engine plugins share the umbrella
  group `ai.miragon.mcp` with the engine carried in the artifactId (`<engine>-<artifact>`);
  the cibseven metrics plugin publishes as `ai.miragon.mcp:cibseven-history-metrics`
  (shadow jar).
- **The server image publishes via `publish-to-docker.yml`** (same train): builds the
  root `Dockerfile` and pushes `docker.io/miragon/miragon-ai-server:<version>` and
  `:latest` to Docker Hub (version = release tag without the `v` prefix, falling back
  to `apps/mcp-gateway/package.json`).
- **`@miragon/mcp-toolkit-*` lives in a separate repository** and is consumed here as an
  exactly pinned dependency (`save-exact`, currently `0.8.0`). Toolkit changes happen in
  that repo and arrive here as a deliberate, repo-wide version bump — and since the
  toolkit is `0.x`, treat every minor bump as potentially breaking.
- **Validating unreleased toolkit changes:** build + `pnpm pack` the toolkit packages,
  point temporary `overrides` in `pnpm-workspace.yaml` at the `file:` tarballs (park any
  `patchedDependencies` entry for the same package while doing so), run the full bar plus
  `test:host`, then revert the workspace yaml + lockfile. Never commit the overrides.

## Verification — what each check actually covers

| Check             | Coverage                                                                                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`      | tsc emit of server code + the gateway's Vite widget bundle (`build:ui`); excludes widget `.tsx` type errors in packages                                                                                                                        |
| `pnpm typecheck`  | **The only check that type-checks widget code** — `tsc -p tsconfig.widgets.json` in mcp-cibseven/mcp-analytics, `tsc -p tsconfig.ui.json` in the gateway                                                                                       |
| `pnpm test`       | Vitest unit tests (lib + query logic) **plus** the gateway e2e smoke + widget wire-contract tests (in-process boot, loopback HTTP); **no widget rendering**                                                                                    |
| `pnpm lint`       | ESLint over each package's `src` (gateway also `test`/`test-host`)                                                                                                                                                                             |
| `./gradlew build` | Kotlin compile + unit tests + Konsist architecture tests (run in `engine-plugins/`)                                                                                                                                                            |
| `test:host`       | `pnpm --filter @miragon-ai/mcp-gateway test:host` — Playwright host simulation of the **built** widget bundle (SEP-1865 shim; structuredContent keep/strip scenarios); required for changes to the widget shell, `src/ui/`, or the toolkit pin |
| Manual            | `docker compose -f docker/docker-compose.yml up -d` + `pnpm dev`, then exercise tools/widgets via the inspector at `http://localhost:8400/inspector`                                                                                           |

A green `pnpm build && pnpm typecheck && pnpm test && pnpm lint` is the minimum bar for
every change; widget changes additionally need `test:host` plus a manual render check via
the inspector (real widget data paths are not covered by the host simulation's fixture).
