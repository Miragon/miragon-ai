# CLAUDE.md

Guidance for AI agents working in this repository. The repo-specific skills
`.claude/skills/add-bpm-feature` and `.claude/skills/add-analytics-feature` contain
step-by-step walkthroughs for the two main feature paths — read them before adding tools,
queries, or widgets; `.claude/skills/add-settings-section` covers the third path,
module-owned user settings (a `profile.modules.<module>` slice + its tool triple + its
section on the settings page).

## What this repo is

"Automation MCP" — a pnpm + Turbo monorepo that ships an MCP server (built on `mcp-use`
plus the `@miragon/mcp-toolkit-*` packages) for Camunda 7 / CIB Seven BPM
operations and Prometheus-backed process analytics, including interactive React widgets
(MCP Apps).

| Path                                                 | Contents                                                                                                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mcp-server-camunda7/`                          | The MCP host: composes plugins, bundles the widget UI, serves HTTP on `:8400`                                                                                                                                                   |
| `packages/connectors/camunda/camunda7-connector/`    | camunda7 module: operations tools, widget tools, widgets, pipeline steps                                                                                                                                                        |
| `packages/connectors/analytics/analytics-connector/` | analytics module: Prometheus-backed tools, dashboards, comparison widgets                                                                                                                                                       |
| `packages/connectors/camunda/camunda7-client/`       | Generated CIB Seven REST SDK (`src/generated/`) + Zod input schemas (`src/schemas/`)                                                                                                                                            |
| `packages/connectors/analytics/analytics-client/`    | Prometheus client + PromQL query functions (`src/queries/`) + Zod schemas                                                                                                                                                       |
| `packages/core/widget-shell/`                        | Shared widget kit: UI primitives incl. `useApplyTheme` + the host app shell `AppShellProviders` (`/widgets`), `adaptDataWidget` (`/ui`), view + data-feed builders, the `shell:*` catalogue + the host-boot helpers (`/server`) |
| `engine-plugins/`                                    | Kotlin/Gradle: CIB Seven OTEL metrics plugin (Java 21)                                                                                                                                                                          |
| `playground/`                                        | Demo env: CIB Seven showcase engine, Compose stack, Fly.io deploy                                                                                                                                                               |
| `docs/`                                              | VitePress docs site (see the `docs-style` skill before editing)                                                                                                                                                                 |

## Commands

```bash
pnpm install --frozen-lockfile       # all deps are public; no registry credential needed

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
inspector UI at `http://localhost:8400/mcp/inspector` (served by `mcp-use dev` only —
the production entrypoint mounts no inspector) — use the inspector to call tools and
render widgets manually.

If generated SDK files look wrong (e.g. `client.gen.ts` importing `./src/hey-api.js`
instead of `../hey-api.js`), the shared turbo cache replayed a poisoned `generate`
output — fix with `pnpm exec turbo run generate --filter=@miragon-ai/camunda7-client --force`.

## Architecture invariants

1. **New operations tools go through the registrar — never raw `server.tool()`.** Add the
   Zod input schema in `packages/connectors/camunda/camunda7-client/src/schemas/`, then register the tool in
   `packages/connectors/camunda/camunda7-connector/src/tools/<domain>.ts` via the `register` callback created by
   `createToolRegistrar` (wired in `src/tools/index.ts`). Every registrar tool carries a
   `category` matching its domain file (e.g. `"process-instances"`, `"tasks"`;
   `"analytics"` for the analytics module). Spread `...engineParamShape` into the input
   schema and wrap the handler in `withEngine(...)` (both from `src/lib/with-engine.ts`).
   See `camunda7_list_process_instances` in
   `packages/connectors/camunda/camunda7-connector/src/tools/process-instances.ts` for the canonical shape.
   Destructive/admin tools must also be listed in `src/lib/toolsets.ts` (`ADMIN_ONLY_TOOLS`)
   so the `camunda7:read-only|operations|admin` toolset filtering stays correct —
   `src/lib/toolsets.test.ts` enforces the rule structurally over every registered tool
   (`destructiveHint` ⇒ admin-only, read-only ⇒ `readOnlyHint`), so get the annotations
   right rather than editing the test. Toolsets are FAIL-CLOSED: without a suffix a module
   runs its read-only floor on an unauthenticated boot and its standard toolset (camunda7
   `operations`, analytics `standard`) under OAuth; `admin` is never implied, and an
   empty/unknown suffix warns and falls back to the floor — nothing ever resolves to
   "everything" (pinned by widget-shell's `toolsets.test.ts` + `composition.test.ts`).
   Admin-only by decision, each with `destructiveHint: true`: the engine-wide
   `camunda7_throw_signal` and the external-task worker protocol (`fetch_and_lock`,
   `complete_external_task`, `handle_external_task_failure` — the read path is
   `camunda7_list_external_tasks`, recovery in `operations` is
   `camunda7_set_external_task_retries`). `camunda7_create_deployment` (`destructiveHint: true`)
   is additionally registered only with `CAMUNDA_ALLOW_DEPLOYMENTS=true`: deploying
   BPMN/DMN is code execution inside the engine JVM (JUEL, scripts) — never relax that
   gate or fold it into a toolset. Tools registered outside the registrar (the
   widget-tools path) that perform durable writes must honor the toolset themselves —
   pattern: `camunda7_save_user_profile` in `src/tools/user-profile.ts`. An ESLint gate
   (`no-restricted-syntax` in `eslint.config.mjs`) blocks raw `server.tool()` — also via a
   computed key, `.call`/`.bind`/`.apply`, destructuring (declaration or assignment, incl.
   string keys) and `Reflect.get` (string or template key), `.ts` and `.tsx`; an inline
   `eslint-disable` of it fails `pnpm lint:ratchets` — outside exactly the widget-path files (in camunda7: `widget-tools.ts` + the
   `widget-tools/` domain registrars + `tools/user-profile.ts`). `no-restricted-syntax` is
   one rule: a later flat-config block REPLACES its selectors, so a glob two gates share
   gets one block with the union; `scripts/eslint-gates.test.mjs` pins that per path.

2. **Never talk to an engine directly.** All engine access goes through
   `resolveEngine`/`withEngine` (`packages/connectors/camunda/camunda7-connector/src/lib/`), which implements the
   multi-engine routing precedence: per-call `engine` override > the caller's saved default
   engine (`profile.modules.camunda7.defaultEngineId`, written by `camunda7_engine` action
   `"select"` and the settings page — resolution is single-sourced in
   `lib/engine-preferences.ts`) > the single configured default. There is deliberately NO
   in-memory session selection (replica-unsafe; mcp-use 2 issues no session ids). Constructing
   or caching a client yourself breaks multi-engine routing. `resolveEngine` (async) already
   returns `baseUrl`/`cockpitUrl` — never fish them out of `registry.engines` yourself.

3. **Widget registration is a four-link chain** — a widget that misses a link is silently
   absent somewhere:
   - `packages/connectors/camunda/camunda7-connector/src/widgets/registry.ts` — component → dataType via `adaptDataWidget`
   - `packages/connectors/camunda/camunda7-connector/src/definition.ts` — widget metadata (`id`, `requires`, `size`, `propsSchema`)
   - `apps/mcp-server-camunda7/src/ui/widget-registry.ts` — the host bundle map (spreads
     `camunda7Widgets`/`analyticsWidgets`)
   - `packages/connectors/camunda/camunda7-connector/src/tool-names.ts` — the tool-name constant for every
     `show_*`/`*_data` tool, so in-widget navigation stays rename-safe

   Links 1↔2 are guarded by `src/widgets/catalogue-sync.test.ts` (both modules have
   one), link 3 by `apps/mcp-server-camunda7/test/widget-registry.test.ts` (every
   catalogued widget id must have a host-bundle entry).

4. **The `dedupe` array in `apps/mcp-server-camunda7/vite.config.ts` is load-bearing — never
   remove or trim it.** Without it each widget package bundles its own React/toolkit
   instance, the React contexts no longer match, `useCallTool()` is undefined, and every
   in-widget query hangs on "Loading…".

5. **There are three render paths — pick deliberately:**
   - Registrar tools (`src/tools/`): plain JSON data _for the model_
   - Widget tools (`widget-tools.ts`, `show_*`, spread `...showToolBinding(name, title)`
     from `@miragon-ai/widget-shell/server` — a `view` binding named after the tool +
     `outputSchema` + the Apps-SDK `_meta` half): render a widget for the user +
     return a summary for the model
   - `*_data` feeds (also in `widget-tools.ts`, spread `...appOnly` — the native
     `visibility: "app"` field + `openai/widgetAccessible`, **no** view binding):
     app-only JSON for in-widget refresh/navigation — SEP-1865
     hosts hide them from the LLM, and a widget-tool result would be rendered by the
     host instead of returned to the in-widget `callTool()`. Feeds return
     `buildDataFeedResult(data)` from `@miragon-ai/widget-shell/server` — the single
     implementation of this invariant

6. **Widgets compose from the shared kit (`@miragon-ai/widget-shell/widgets`) — never
   re-inline its primitives.** `ViewDataState` for the loading/error/no-data guard;
   `QueryFallback` + `TableSkeleton` for self-fetching widgets (a missing `isError`
   branch means an eternal skeleton); `formatTimestamp`/`formatDate`/`formatTime`/
   `formatDuration`/`truncate` for all formatting (canonical duration style "3m 7s";
   an ESLint gate bans `Intl.DateTimeFormat`/`toLocaleDateString`/`toLocaleTimeString`
   in widget code — `Number#toLocaleString` for counts stays allowed);
   `Section`, `Th`/`Td`/`TableEmptyState`, `WidgetHeader` + `VersionChip`, `KpiGrid`,
   `WidgetShell` for structure; `SettingsCard`/`SettingsField`/`SettingsInput` for
   settings sections; `useBpmnViewer` + `BpmnZoomControls` for BPMN, with
   highlight/legend colors from `HIGHLIGHT_COLORS`
   (`packages/connectors/camunda/camunda7-connector/src/widgets/bpmn-highlights.ts`). Paged lists compose
   `usePagedListView` (search + debounce + paging scaffold; feed must accept
   `firstResult`/`maxResults` and return an honest total) + `ListTable` (the table
   frame; rows stay hand-composed `<tr>` + `Td`) + `PagedListFooter` (in camunda7 via
   the i18n-bound `CockpitListFooter`, `src/widgets/list-footer.tsx`). Optimistic
   local state (resolved marks, variable shadows, form baselines) is dropped with
   `useResetOnChange(data, reset)` — React's render-phase "adjust state when a prop
   changes"; `useEffect(reset, [data])` is the shape `react-hooks/set-state-in-effect`
   rejects, and it commits the stale shadow once before correcting it. Refs are never
   written during render (`react-hooks/refs`): a discarded render still mutates them,
   so anything a guard reads belongs in state — see `usePagedViewData`'s generation.

7. **Shared server data paths are single-sourced.** Definition name/version/instance
   lookups come from `packages/connectors/camunda/camunda7-connector/src/data/definition-info.ts`;
   `data/bpmn-viewer-data.ts` feeds BOTH the widget tool and the pipeline step — never
   fork them. Every engine REST rule the client defaults miss — engine dates
   (`toEngineDate`), paired sorting (`engineSorting`), serialized variable writes
   (`toEngineVariable(s)`), text/plain endpoints, raw variable reads, incident recovery,
   queued batches — lives in the engine contract,
   `packages/connectors/camunda/camunda7-client/src/engine-contract/`, used by `tools/` AND
   `data/` (guards: `src/engine-contract.test.ts`, `src/tools/*.wire.test.ts` — every write
   tool has a recording-fake-engine wire case). Analytics periods derive from
   `PERIODS`/`PERIOD_RANGE` (analytics-client) — no hardcoded enum copies. The profile STORE (record schema, in-memory/
   filesystem/postgres implementations, migrations) is core:
   `packages/core/widget-shell/src/profile-{record,store,store-postgres,migrations}.ts`
   (`@miragon-ai/widget-shell/server`) — the record is connector-free (language,
   theme, `modules.<module>` slices + metadata; camunda7's engine/dashboard
   preferences live in ITS slice, `modules.camunda7`, projected to a flat
   `UserProfile` view in `camunda7-connector/src/lib/profile-schema.ts`).
   Records migrate on read through `parseStoredProfile` (shared by every store;
   per-FIELD fail-soft) — a `PROFILE_SCHEMA_VERSION` bump without a matching
   `PROFILE_MIGRATIONS` entry leaves stored preferences un-migrated. Saves merge over
   the RAW stored document (`mergeStoredProfile`, inside each store's per-key lock),
   never over the parsed view, so keys a newer build wrote survive. **Whose** profile a request touches is
   decided in exactly one place for ALL modules: `resolveProfileKey`/`resolveAuthUserId`
   - `ANONYMOUS_PROFILE_KEY` + the narrow `ProfileSource` port, in
     `packages/core/widget-shell/src/profile.ts` (`@miragon-ai/widget-shell/server`). A
     module-local copy of that precedence would silently split one user's settings across
     two records; the app's `module-contract.ts` carries a compile-time assertion that
     camunda7's `ProfileStore` still satisfies the port.
     The whole PERSISTENCE layer follows the same rule: the postgres.js client
     (`createSql`), the migration runner (`runMigrations` + the `Migration` shape) and the
     Postgres dashboard store (`createPostgresDashboardStore`, implementing the toolkit's
     `DashboardStore`) live in `packages/core/widget-shell/src/{postgres,dashboard-store-postgres}.ts`
     next to the profile store — a composed server imports them from
     `@miragon-ai/widget-shell/server` instead of reimplementing them, and the app's
     `src/persistence/index.ts` shrinks to the env→backend SELECTION (`DATABASE_URL` beats
     `MCP_PROFILE_DIR`/`MCP_DASHBOARD_DIR` beats in-memory). Migration `name`s are the keys
     recorded in `schema_migrations`: append-only, never renamed (a rename re-runs the DDL
     on every existing database), and each store owns its own array. Writes that first-create
     a row take a per-key `pg_advisory_xact_lock` — `SELECT … FOR UPDATE` cannot lock a row
     that does not exist yet, so without it two concurrent first saves both take the create
     branch and the second silently overwrites the first, ownership check included.

8. **Modules are self-contained peers; the app is a thin composition root.**
   Connector packages never import each other. Layout + naming carry the layer
   semantics and are load-bearing for the guardrails: connector modules live at
   `packages/connectors/<family>/<name>-connector` (npm `@miragon-ai/<name>-connector`),
   their SDK leaves at `packages/connectors/<family>/<name>-client`
   (npm `@miragon-ai/<name>-client`), foundation packages under `packages/core/`
   — a new package that follows the convention is covered by the dependency rules
   without touching them; one that breaks it would silently fall OUT of the rules,
   which is why the convention itself is gated: `scripts/check-package-naming.mjs`
   (`pnpm lint:naming`, part of `pnpm lint`) fails on any workspace package whose
   directory or npm name breaks the pattern.
   The dependency edges of this invariant
   (connector peer-isolation, connector→own-client only, leaf clients, foundation
   core, packages never importing the app, no cross-package deep imports)
   are machine-enforced by `.dependency-cruiser.cjs` via the root
   `pnpm lint:architecture` (part of `pnpm lint`). Each module exports its definition in
   `src/module.ts` (config schema, `configFromEnv`, `knownEnvVars`, `toolsets`,
   `bootWarnings`, plugin factory) conforming STRUCTURALLY (no import) to the port. The
   port SHAPE (`ComposableModule<TShared>`) and the whole composition-root machinery
   (`composeModules`: `MCP_ACTIVE_MODULES` parsing incl. `module:toolset` suffix;
   `resolveBoot(env, { authenticated })`, which resolves ONE concrete toolset per module
   per boot from the module's declared `toolsets` vocabulary (`createToolsetVocabulary`;
   the old `supportsToolsets` flag is deprecated) and threads it into `config.toolset`;
   `logEffectiveToolsets`, the one boot line stating each module's toolset and why;
   env-typo warner with prefixes derived from every known var, boot warnings,
   AppConfig/plugin assembly) live in `@miragon-ai/widget-shell/server`. The root passes
   `authenticated` only when it actually INSTALLED OAuth — never inferred from an env var.
   Framework durable writes no module toolset filters (the toolkit builder's
   `get-builder-catalogue` + `save/list/load/delete-dashboard`) are registered only when
   `frameworkWritesAllowed(boot)` holds — OAuth installed AND no active module on its
   read-only floor or on the deprecated `supportsToolsets` pass-through; `render-view`/`refresh-view`/`get-framework-manifest` stay always. The
   app's `module-contract.ts` instantiates it with ITS `SharedResources` and its `setup.ts`
   only declares the module list and wires `SharedResources` (profile store +
   `fetchBpmnXml` — the camunda7 BPMN-XML lookup injected into the analytics heatmap;
   analytics has NO engine-SDK dependency). Apps own no domain UI: widget catalogues and
   components live in packages — and no boot plumbing either. The bundle root's provider
   stack (`AppShellProviders`: theme → host bridge → display mode → `ProfileGate` →
   host widget registry; order is load-bearing) plus `LocalizedAppView` live in
   `@miragon-ai/widget-shell/widgets`, and the whole server boot lives in `/server`:
   `createComposedServer` owns the ORDER (env-typo warnings + HTTP edge policy + the
   OAuth/`MCP_URL` check → ONE `resolveBoot`, authenticated exactly when the root hands
   in an OAuth provider → boot log → the root's `setup(boot)` (plugins, persistence) →
   `createFrameworkApp` with `serverInfo` (version from the root's `package.json`, title,
   `instructions`) → request context → `installToolCallLogging` →
   `swallowDevCliViewsPrime` → `installMetrics` (labels bounded by construction: tool
   catalogue + known routes, never users/sessions/arguments; optional
   `MCP_METRICS_TOKEN` bearer) → `installHttpEdgeGuard` → `installHealthEndpoints`
   (readiness probes the server's OWN dependencies only, never engines or Prometheus;
   503 `draining` during shutdown) — metrics first, hono only counts routes registered
   after its middleware) and its `listen()` serves production through
   `createBodyLimitedListener` (mcp-use's public `toNodeHandler` behind the
   `MCP_MAX_BODY_BYTES` cap — 413 before buffering — an in-flight body budget of 4× the
   cap — 503 — and a 30 s request timeout; a request the guard refuses is never read,
   both decide by the one `edgeRejection`) with the graceful drain (stop accepting →
   in-flight finish, bounded, readiness 503 `draining` → `app.close()` → the root's
   `runtime.shutdown()`). The edge (`resolveHttpEdgePolicy`) is DNS-rebinding protection:
   Host on every request, Origin on non-GET requests that carry one, admitted only when
   localhost-class, `MCP_URL`'s or in `MCP_ALLOWED_HOSTS`/`MCP_ALLOWED_ORIGINS` —
   `/health*` and `/metrics` are exempt (probes and scrapers address a container by IP);
   never swap it for mcp-use's `allowedHosts`, which guards those too. Each app owns ONE
   `createApp(env, deps?)` (`src/app.ts`: its OAuth decision, persistence, plugins) that
   `src/index.ts` (production and `mcp-use dev`, which owns the socket — no cap, no drain —
   and the Host check: the guard defers that half to the CLI, which admits its tunnel host)
   AND the e2e suites boot — never a test-only re-implementation of the boot — so
   `src/ui/main.tsx` and `src/index.ts` stay composition (registry, profile-feed name,
   app-specific layers like `Camunda7StandaloneShell`) and a toolkit/mcp-use migration
   lands once instead of in every composed-server fork.
   Cross-module UI is tiered: `shell:*` widgets via
   `props.dataKey`; raw tool-name strings with graceful degradation (reference:
   `process-incidents/flow.tsx` → `analytics_bpmn_heatmap_data`); hard-composed views go in a
   dedicated package created with the first real view — never in the app, never as
   module-to-module imports. The host bundle is static — `MCP_ACTIVE_MODULES` changes only
   the server's tool surface — so a widget-registry lookup cannot tell a runtime-INACTIVE
   module; a surface that only makes sense with another module probes one of its cheap
   feeds (reference: `useAnalyticsActive` → `analytics_settings_data`, gating camunda7's
   cross-engine view) and appears once confirmed. Graceful degradation hides a stale raw
   name at runtime, so `apps/mcp-server-camunda7/test/tool-name-refs.test.ts` checks every
   `<module>_…` string literal in app and package sources (incl. the composition root's
   hardcoded profile feed) against the full booted tool surface.
   The settings page follows the same tiers: each module
   owns its settings section (widget + `*_data` feed + save tool; reference:
   `analytics:settings` + `analytics-connector/src/settings-tools.ts` — the save tool honors
   `analytics:read-only`), its slice persists under `profile.modules.<module>`
   (validated fail-soft by the owning module — camunda7's save tool deliberately
   excludes `modules`), and composed views reference foreign section widgets by raw
   id — resolved through `HostWidgetsProvider` (host root) and dropped by
   `filterLayoutToWidgets` when unresolvable, so a missing module's section disappears
   instead of erroring. The settings LAYOUT is not hand-maintained: `settingsLayout`
   (`camunda7-connector/src/widgets/cockpit-app/views.ts`) assembles the page from the
   HOST's widget registry — camunda7's own `camunda7:user-profile` panel first, then one
   row per `<module>:settings` id in registration order — so a custom module in a
   composed server contributes its section without an edit in the camunda7 package.
   The convention (`<module>:settings`) is therefore load-bearing, and the failure mode
   stays silent (a section whose widget never reaches the host registry is simply
   absent), so `apps/mcp-server-camunda7/test/widget-registry.test.ts` asserts the
   assembled layout against both module catalogues (the template test does the same for
   its modules). Save-input schemas at tool
   boundaries must be default-FREE (zod 4 re-applies `.default()`s through `.partial()`,
   materializing omitted fields into silent resets — derive them with `withoutDefaults`
   from `@miragon-ai/widget-shell/server`; see
   `userProfileToolSaveInput`/`analyticsSettingsSaveInput`). A durable write registered
   outside the tool registrar gates itself against the module's declared toolset names
   (`allowsDurableWrites` in `analytics-connector/src/toolsets.ts`, `isToolInToolset` in
   camunda7) — never an ad-hoc `toolset === "read-only"` compare, which fails open for
   every other name, and never a `toolset === undefined` shortcut either: an absent
   toolset no longer means "everything", the vocabulary resolves it to the read-only
   floor — and carries that same decision into its view as `canSave`, so the
   section renders disabled fields instead of a Save button whose click would resolve to
   an unknown tool. In-widget engine writes follow the same rule: every tool a widget
   mutates is listed in `CAMUNDA7_WIDGET_ACTIONS` (`tool-names.ts`) and its button renders
   only when `useCanRun()` allows it (fed by `camunda7_widget_actions_data` →
   `allowedWidgetActions`) — hidden, not disabled; `src/widget-actions.test.ts` fails on
   an unlisted in-widget write. Engine _vendors_ (CIB Seven, Operaton, Camunda 7) are
   per-engine runtime config (`flavor` → `EngineProvider` in
   `packages/connectors/camunda/camunda7-connector/src/providers/` — the port holds ONLY real differences:
   cockpit routes, branding, client hook; never an SDK mirror), never separate apps; a different _dialect_ (Flowable)
   would be a new module + client + app. Extract shared packages on the second concrete
   consumer, never speculatively.

## Contracts

- **`packages/connectors/analytics/analytics-client/metrics-contract.json` is the single source of truth for
  metric names and labels — when changing a metric, change it here first.** The Kotlin
  plugin (`engine-plugins/cibseven-history-metrics/.../ProcessMetrics.kt`,
  `EngineStateMetrics.kt`) emits Micrometer meters whose dotted names (`otelName` —
  also the OTLP wire name on the push path) surface in Prometheus as `camunda_*`
  series (`promName`, e.g. `camunda.activity.ended` →
  `camunda_activity_ended_total`; durations carry base unit `seconds`, spelled out
  so every export path appends the same `_seconds` suffix). Consumers — the TS queries (via `METRIC_NAMES` in
  `packages/connectors/analytics/analytics-client/src/metric-names.ts`, never raw strings), the alert rules
  (`playground/docker/prometheus/alerts.yml`), and the Grafana dashboards
  (`playground/docker/grafana/dashboards/*.json`) — are checked against the contract by tests on
  both sides: `packages/connectors/analytics/analytics-client/src/metrics-contract.test.ts` (vitest — also
  covers the Grafana dashboards incl. regex matchers, per-metric `sum by (…)` grouping
  labels, and a dead-entry check with a documented allowlist; its behavioural twin
  `src/metrics-contract-labels.test.ts` runs EVERY exported query function through a
  recording client and checks every matcher/`by`/`on` label against the contract — alert
  rules and dashboards included; its `SCENARIOS` map is total over `queries`, so a new
  export needs an entry, and new PromQL shapes extend the `*.test-support.ts` checker
  rather than bypass it) and
  `engine-plugins/cibseven-history-metrics/.../MetricsContractTest.kt` (Gradle — also
  checks the label keys each instrument attaches). A rename that skips the contract or
  a consumer fails one of them; don't weaken these guards to make a change pass. Only
  attach model-bounded labels (definition key, activity id, engine id …) — never
  instance ids, business keys, or variable values.
- **Never aggregate a RATE across engines.** Engines host different process definitions,
  so a failure rate, incident rate or duration summed per `engine_id` measures that
  engine's process mix, not the engine — the aggregate can even invert the per-process
  truth. Cross-engine views therefore report absolute counts plus the engine-owned
  backlog gauges (`jobs_executable`, `jobs_suspended`, `jobs_due_future`,
  `external_tasks_open` — the family whose contract labels are `engine_id` ONLY, so no
  mix can confound them): `queries/engine-landscape.ts` + `analytics:engine-landscape`,
  surfaced in camunda7's cross-engine cockpit mode by raw widget id (tier-2). A
  like-for-like engine KPI comparison exists only with the process held fixed, which is
  why `engineCompare`/`analytics_engine_compare` REQUIRE a `processDefinitionKey`
  (`sharedProcessKeys` from the landscape are its valid inputs) — don't make it optional
  again. The tool descriptions carry this rule to the model and are asserted in
  `src/tools/engine-{compare,landscape}.test.ts`.
- **Pinning is split by dependency stanza.** `dependencies`/`devDependencies` stay
  EXACT (`save-exact=true` in `.npmrc`; the `Miragon/pin-npm-dependencies` CI action
  enforces it — it deliberately ignores `peerDependencies`). The genuinely
  consumer-shared libraries are published as RANGED `peerDependencies` so a downstream
  React + zod app dedupes them against its own copy instead of getting a second
  instance: `react`/`react-dom` `^19.2.0`, `zod` `^4.4.0`, `@miragon/mcp-toolkit-*`
  `~2.6.0` (2.6.x patches only, tracking the exact `mcp-use` pin). Each ranged peer also
  appears as an EXACT `devDependency` so the in-repo build/tests resolve a concrete
  version. **`mcp-use` is the exception: exactly pinned even as a peer** (`2.7.3`) — a
  duplicate `mcp-use` instance breaks the React context and hangs every in-widget query
  on "Loading…" (invariant #4), so its exact pin is load-bearing. Name the required
  `mcp-use` version in each package README and the release changelog. Toolkit updates are
  still deliberate version bumps across all packages — never bump a single package in
  isolation; the toolkit peers `mcp-use` exactly (toolkit `2.6.0` → `mcp-use@2.7.3`;
  `zod`/`react` it peers as ranges), so a toolkit MAJOR/MINOR bump is a joint toolkit + `mcp-use` bump across
  every package incl. `templates/composed-server` — `scripts/test-template.sh` fails if
  the template is left behind.
- **The widget `_meta` contract is split since mcp-use 2 — never hand-write the
  `ui` half.** mcp-use emits the MCP-Apps keys (`_meta.ui.resourceUri`, flat
  `ui/resourceUri`, `_meta.ui.visibility`, the view resources `ui://views/<tool>.html`)
  natively from the tool's first-class `view`/`visibility` fields and OVERWRITES the
  `ui` namespace on tools/list; the toolkit's `appsSdkMeta({ resourceUri:
viewResourceUri(name), title })` stamps only the `openai/*` half
  (`openai/outputTemplate`, `openai/toolInvocation/*`, `openai/widgetAccessible`,
  `openai/resultCanProduceWidget`). App-only `*_data` feeds stay free of the rendering
  keys on purpose. Guarded by
  `apps/mcp-server-camunda7/test/widget-meta.test.ts` (unit) and
  `apps/mcp-server-camunda7/test/widget-contract.e2e.test.ts` (on the wire, **by name**: every
  `*_show_*` tool must carry the widget `_meta`, every `*_data` feed must be app-only —
  the naming convention is load-bearing; don't weaken the name checks).
- **The tools/list wire payload is a golden, per toolset.**
  `apps/mcp-server-camunda7/test/tools-list.golden.test.ts` boots `createApp` for
  read-only (unauthenticated default), operations (default under OAuth) and admin (full
  surface) and compares the complete sorted tools/list — descriptions, titles, annotations,
  `_meta` incl. `ui.visibility`, input/output schemas — against
  `test/__golden__/tools-*.json`. The ONLY update path is
  `GOLDEN_UPDATE=1 pnpm --filter @miragon-ai/mcp-server-camunda7 test` (refused in CI);
  never hand-edit a golden. `__golden__/char-budgets.json` pins each surface's
  model-visible size (name + title + description + inputSchema of non-app-only tools):
  the test pins it exactly and `pnpm lint` makes it shrink-only, so a tool change that
  makes the model read MORE text needs a `Ratchet-Exception:` trailer (see Verification).
  The name lists in `test/expected-tools.ts` stay the reviewable per-toolset summary.
- **Federation/aggregation happens in an external MCP gateway (agentgateway) IN FRONT of
  this server; this repo builds one self-contained MCP server including its UI.** No
  upstream/proxy mechanics in the code — don't reintroduce a proxies/upstream option
  (federation was deliberately dropped in #162). A gateway that terminates auth in front
  is invisible to this server: without `MCP_OAUTH` it boots read-only, so such a
  deployment must name its toolsets in `MCP_ACTIVE_MODULES`. The generic
  `shell:kpi-grid`/`shell:data-table` widgets (catalogue + components in
  `@miragon-ai/widget-shell`) are always registered — they are the standard
  `render-view`/builder composition targets for KPI rows/tables, fed via `props.dataKey`.

## Releases & toolkit contributions

- **Everything releases through one release-please train.** Conventional commits on
  `main` drive `release-please.yml`, which opens/updates a single Release PR (root
  component, tag `v<version>`); release-please bumps the root, the server app, all five
  `packages/` `package.json`s, the template's `@miragon-ai/*` pins plus
  `engine-plugins/gradle.properties` in lockstep (`extra-files` in
  `release-please-config.json`). Merging the PR creates the release; the publish
  workflows then wait for manual approval of the `release` environment gate.
- **The five packages publish to the public npm registry.** The release train's
  `publish-npm` matrix calls `publish-npm-package.yml` (OIDC trusted publishing, no
  NPM_TOKEN; provenance attached) for `@miragon-ai/{widget-shell,camunda7-connector,
camunda7-client,analytics-connector,analytics-client}` — matrix entries are package
  DIRECTORIES under `packages/`; the npm name is read from each `package.json`.
  Afterwards `sync-template-mirror.yml` waits until the versions are visible on npm and
  mirrors `templates/composed-server` to the `Miragon/miragon-ai-starter` repo — the
  customer-facing composition path (own server + own connector on the published
  packages), drift-gated by `scripts/test-template.sh`. Only the server app stays
  `"private": true`.
- **Engine plugins publish to Maven Central via `publish-to-maven.yml`** (called from the
  release train): the Vanniktech Maven Publish plugin runs
  `publishAndReleaseToMavenCentral` against the Sonatype Central Portal (thin jar +
  sources + javadoc, GPG-signed; signing gated on `-PsignArtifacts=true`). Credentials
  are `ORG_GRADLE_PROJECT_*` env vars (`mavenCentral{Username,Password}` +
  `signingInMemoryKey{,Id,Password}`) from the `MIRAGON_SONATYPE_*` / `SIGNING_*` secrets.
  All engine plugins share the umbrella group `io.miragon.mcp` (reusing the org's verified
  `io.miragon` Central namespace) with the engine carried in the artifactId
  (`<engine>-<artifact>`); the cibseven metrics plugin publishes as
  `io.miragon.mcp:cibseven-history-metrics`. Per-module publishing config lives in the
  module's own `build.gradle.kts` (`mavenPublishing { ... }`), not the root convention.
- **The server image publishes via `publish-to-docker.yml`** (same train): builds the
  root `Dockerfile` and pushes `docker.io/miragon/miragon-ai-server:<version>` and
  `:latest` to Docker Hub (version = release tag without the `v` prefix, falling back
  to `apps/mcp-server-camunda7/package.json`).
- **`@miragon/mcp-toolkit-*` lives in a separate repository.** In `devDependencies` it is
  exactly pinned (`save-exact`, currently `2.6.0`); in the published surface it is a
  ranged `peerDependency` (`~2.6.0`) so consumers dedupe it. Toolkit changes arrive here
  as a deliberate, repo-wide version bump — since 1.0 the toolkit follows semver
  (breaking changes arrive as major bumps).
- **Validating unreleased toolkit changes:** build + `pnpm pack` the toolkit packages,
  point temporary `overrides` in `pnpm-workspace.yaml` at the `file:` tarballs (park any
  `patchedDependencies` entry for the same package while doing so), run the full bar plus
  `test:host`, then revert the workspace yaml + lockfile. Never commit the overrides.

## Verification — what each check actually covers

| Check                | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`         | tsc emit of server code + the server app's Vite widget bundle (`build:ui`); excludes widget `.tsx` type errors in packages                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm typecheck`     | **The only check that type-checks widget code** — `tsc -p tsconfig.widgets.json` in the two connector packages, `tsc -p tsconfig.ui.json` in the server app                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm test`          | Vitest unit tests (lib + query logic) **plus** the server app e2e smoke + widget wire-contract tests + per-toolset tools/list goldens (in-process boot, loopback HTTP); **no widget rendering**; enforces the per-package coverage ratchet (frozen thresholds in each `vitest.config.ts`); then `test:scripts` — `node --test` over `scripts/*.test.mjs` (the gate scripts' own tests + the ESLint pattern-gate self-test)                                                                                                                                                                                                                                                                           |
| `pnpm lint`          | ESLint over each package's `src` (the server app also `test`/`test-host`) incl. the pattern gates (registrar-only tools, widget-shell date formatting), then `lint:architecture` (dependency-cruiser), `lint:naming`, `lint:package-scripts` (every package with `src/` runs the canonical `eslint src` / `tsc --noEmit` (+ `tsc -p` per extra tsconfig) / `vitest run` (+ `stryker run`) — turbo silently skips a missing script, and a flag can switch a present one off), `lint:ratchets` (`scripts/check-ratchets.mjs`, below; needs the merge base — `git fetch origin`) and `lint:deadcode` — knip over files/dependencies/unlisted (unused exports are report-only for now: `pnpm exec knip`) |
| `pnpm test:mutation` | Diff-scoped Stryker run (`scripts/mutation-diff.mjs`): changed files inside a package's `mutate` allowlist must keep the mutation score above the package's `thresholds.break` (`stryker.config.json`); runs in CI as "Mutation (changed files)". The gate bypasses the package's incremental cache, so a local run and CI agree. More than 25 in-scope files in one package FAIL the gate unless the branch carries a reviewed `Mutation-Cap-Exception: <reason>` trailer                                                                                                                                                                                                                           |
| `pnpm fitness`       | Aggregated fitness report — architecture graph, ratchet debt, per-package coverage + mutation scores (diff-scoped in CI — the file count next to each score says over what); its own CI job, fed by the test + mutation jobs' artifacts                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `./gradlew build`    | Kotlin compile + unit tests + Konsist architecture tests (run in `engine-plugins/`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `test:host`          | `pnpm --filter @miragon-ai/mcp-server-camunda7 test:host` — Playwright host simulation of the **built** widget bundle: the view document `createApp` serves (`resources/read`), sandboxed behind a SEP-1865 host shim, rendering a real camunda7 show tool against a stub engine (keep/strip, slow tool, `isError`, cancel, host theme, display modes; `pinned …` scenarios = known defects, flipped when fixed); runs in CI as "Widget host simulation (test:host)" — run it locally for changes to the widget shell, `src/ui/`, or the toolkit pin                                                                                                                                                 |
| `pnpm test:pg`       | The database slice: reruns the suites with `TEST_DATABASE_URL` pointed at the compose stack's test database, which un-skips the Postgres store + migration-runner tests (`describe.skipIf`). **The only check that executes the Postgres adapters**; runs in CI as "Postgres adapters (test:pg)" against a `postgres:` service container — run it locally for changes to `postgres.ts` or any `*-store-postgres.ts`                                                                                                                                                                                                                                                                                  |
| Docker build         | `.github/workflows/docker-build.yml`: plain `docker build` of the root `Dockerfile` (no push) on every PR touching it, `apps/`, `packages/` or a root file the build stage copies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Manual               | `docker compose -f playground/docker/docker-compose.yml up -d` + `pnpm dev`, then exercise tools/widgets via the inspector at `http://localhost:8400/mcp/inspector` (`pnpm dev` only). The default boot is read-only — write paths need an explicit suffix, e.g. `MCP_ACTIVE_MODULES=camunda7:admin,analytics:standard` in `.env`                                                                                                                                                                                                                                                                                                                                                                    |

A green `pnpm build && pnpm typecheck && pnpm test && pnpm lint` is the minimum bar for
every change; widget changes additionally need `test:host` plus a manual render check via
the inspector (the host simulation renders one real view, not every widget's data path).

Ratchet rules are shrink-only: the complexity/max-lines offender lists in
`eslint.config.mjs` (global budgets: complexity 15, 400 effective lines) and the coverage
thresholds in each `vitest.config.ts` may only improve — delete a list entry or raise a
threshold when you better a file, never the reverse, and never add new entries. The
mutation ratchet works the same way inverted: each package's `mutate` allowlist in
`stryker.config.json` is the TESTED surface and may only GROW (add files when you add
tests), and `thresholds.break` may only rise. Mutation runs use
`vitest.stryker.config.ts` (coverage off — a coverage-threshold failure would read as a
killed mutant); the Stryker vitest runner disables per-file isolation, so DOM widget
suites stay out of the mutation test set (see the camunda7 connector's config). The
Postgres adapters (`src/postgres.ts`, `src/*-store-postgres.ts`) are out of BOTH sets —
the shared `coverage.exclude` in `vitest.shared.ts` and widget-shell's `mutate` negatives
— because their suites only run under `pnpm test:pg`: counted in, the same commit would
measure ten points apart depending on whether a database happened to be reachable, and
every mutant would survive by construction. That exclusion is scoped to those two
patterns and is not a precedent for excluding code that the default run CAN execute. The knip ignore
lists in `knip.jsonc` follow the same convention: every entry carries its reason and
the lists may only shrink; gating the unused-exports report is the next expansion.

These directions are machine-checked, not review-only: `scripts/check-ratchets.mjs`
(`pnpm lint:ratchets`, part of `pnpm lint`) compares every ratchet against the MERGE BASE
with `origin/main` (in CI always `origin/$GITHUB_BASE_REF` — a positional base ref is
ignored there, a PR whose merge base is HEAD fails, and the job checks out with
`fetch-depth: 0`) — never against the PR's own files — and fails on a lowered/removed
coverage threshold, coverage switched off, a new coverage or test `exclude`, a coverage
`include` that appears or a narrowed `include`, a lowered `thresholds.break`, a shrunk
`mutate` list (unless `break` rises in the same diff or the entry's file is gone), any
other changed Stryker option that decides which mutants exist or count (`ignoreStatic`,
`ignorers`, `timeoutMS`, the runner…), a new or raised ESLint debt entry, a raised global
budget, any new complexity/max-lines override or gate rule switched off/to warn, a new
ESLint ignore (keyed by the block it exempts from) or knip ignore/exclude/`entry`, a knip
`include`/`project`, a grown tools/list char budget, a gate dropped from the root
`lint`/`test` chain or a chain gaining anything but a plain `pnpm <script>`, and ANY change
to a gate command — the chained root scripts plus `build`/`typecheck`/`format:check`/
`test:pg`/`test:mutation`, and each package's `lint`/`typecheck`/`test`/`test:mutation`
(only an `--exclude` list may shrink). It fails closed on what it cannot read: a
non-literal `rules`, a spread, a local import or `Object.entries(…)` in `eslint.config.mjs`
is frozen, and on top of the AST reading `scripts/eslint-effective-config.mjs` asks ESLint
itself for the effective complexity/max-lines/`no-restricted-syntax` settings of every
source file (plus a sample path per glob) under the base and the new config. A shadowing
config fails whenever it exists — any `eslint.config.*` besides the root `.mjs`, a
`knip.json`/`.knip.json(c)`/`knip.{ts,js}`/`knip.config.*` or `package.json#knip` besides
`knip.jsonc`, a `stryker.conf.*`/`.stryker.*` besides `stryker.config.json` — because each
tool would load it INSTEAD of the ratcheted file; deleting `knip.jsonc` fails too. Inline
suppressions are shrink-only: an `eslint-disable` naming complexity, max-lines or
`no-restricted-syntax` (or no rule), inline gate-rule config, `v8|c8|istanbul ignore` or
`Stryker disable` in `apps/`/`packages/` sources. The working tree is the new side, so
uncommitted loosening fails locally too. The single escape is a commit trailer
`Ratchet-Exception: <reason>` in the branch range — it turns the failures into loud
warnings for the reviewer; never weaken the checker instead.
