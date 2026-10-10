---
name: add-analytics-feature
description: Step-by-step house pattern for adding a new analytics capability — a PromQL query function in `packages/connectors/analytics/analytics-client`, a tool in `packages/connectors/analytics/analytics-connector`, and optionally a dashboard widget. Use whenever adding or changing process analytics ("add a query for X", "new KPI/metric analysis", "extend the analytics dashboard"), PromQL queries, Prometheus-backed tools, or analytics widgets. Takes precedence over the generic mcp-apps-builder skill.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

# add-analytics-feature — new query/tool/widget in the analytics module

Analytics is metric-first: query functions issue instant PromQL queries against
Prometheus (`/api/v1/query`) where the range window carries the time period, then map the
labeled samples into row shapes. There is no event store — anything that needs
per-instance event ordering is out of reach and must be documented as such (see the
`avg_wait_sec: null` notes in `queries/element.ts`).

## Step 1 — query function in analytics-client

Add the function to `packages/connectors/analytics/analytics-client/src/queries/<topic>.ts` and export it
(plus its result types) from `src/queries/index.ts`. Always build selectors with the
helpers from `src/prometheus.ts` — never concatenate label values by hand:

- `escapeLabelValue(value)` — escapes `\` and `"` for use inside a label matcher
- `engineMatcher(engine)` — optional `engine_id="…"` / `engine_id=~"a|b"` fragment
- `selector(...matchers)` — assembles `{…}`, dropping empties
- `PERIOD_RANGE` / `PERIODS` / `Period` — the allowed windows (`1d`–`30d`, capped at
  retention); derive anything period-shaped from these — never copy the enum

Reference shape (from `elementBottleneck` in `src/queries/element.ts`):

```ts
import { METRIC_NAMES as M } from "../metric-names.js"

const sel = selector(
  `process_definition_key="${escapeLabelValue(params.processDefinitionKey)}"`,
  engineMatcher(params.engine),
)

const [counts, sums] = await Promise.all([
  ch.instant(`sum by (activity_id)(increase(${M.activityEnded}${sel}[${range}]))`),
  ch.instant(`sum by (activity_id)(increase(${M.activityDuration}_sum${sel}[${range}]))`),
])
```

**Metric-name contract:** series names come from `METRIC_NAMES`
(`src/metric-names.ts`) — never raw `camunda_*` literals; a guard test in
`src/metrics-contract.test.ts` fails on them. Histogram entries are the base name —
append `_sum`/`_count`/`_bucket` at the call site. The single source of truth is
`packages/connectors/analytics/analytics-client/metrics-contract.json`: if you need a _new_ metric or label,
change the contract first, then the Kotlin plugin
(`engine-plugins/cibseven-history-metrics/.../ProcessMetrics.kt` /
`EngineStateMetrics.kt`), `METRIC_NAMES`, and any alert rules / Grafana dashboards —
contract tests on both sides enforce consistency: the TS side also checks the Grafana
dashboards (incl. regex matchers), `sum by (…)` grouping labels, and dead contract
entries (documented allowlist in the test); the Kotlin side checks the label keys each
instrument attaches. Don't weaken these guards. Keep labels model-bounded (never
instance ids, business keys, variable values).

**Label contract:** `src/metrics-contract-labels.test.ts` runs every exported query
function against a recording client and checks each label the sent PromQL names — matchers,
`by`/`without`, `on`/`ignoring`/`group_*` — against the labels the contract declares for
that series; alert rules and Grafana dashboards go through the same checker. The calls it
runs come from the `SCENARIOS` map in `src/query-scenarios.test-support.ts` (shared with the
honesty guard below), total over the `queries` namespace, so a new export without an entry
fails `pnpm typecheck`. Give the entry argument sets that switch on every optional matcher
(engine filter single and multi, element/incident scope, process scope present and
absent). A PromQL shape the checker (`src/promql-{parse,labels,sources}.test-support.ts`)
rejects means extending the checker, never bypassing it.

**Honesty rules** — `src/query-honesty.test.ts` runs the same scenarios and holds two more
total maps a new export must fill (`pnpm typecheck` fails otherwise): `NO_DATA` (what the
function returns against an empty Prometheus) and `SCOPE_ECHO` (how its result names the
engines it covers — `engines: engineIdsOf(params.engine)`, or a stated exemption). Build the
result so those entries can hold:

- `first()` (missing series → 0) only for COUNTS; durations and gauges use `firstOrNull()` —
  "nothing ended" is `null`, never 0 s. A per-key gauge (running, open incidents) has no row
  for what does not exist, so decide 0 vs `null` with the presence probe
  `reportingEnginesQuery` (`queries/helpers.ts`), never from the gauge's own series.
- Rates and deltas through `ratePct`/`pctChange`/`ppDelta` — `null` on a zero or unmeasured
  base, never 0 % or −100 %.
- Explicit time windows through `clampWindow` + `rangeAt` (`queries/windows.ts`): clamped to
  `[now − retention, now]`, reported as measured (`partial`), refused when unrepairable; per-day
  rates from the exact `seconds`, never the rounded `daysOf`.

## Step 2 — PromQL snapshot test

Co-locate `<topic>.test.ts` next to the query. Use the mock-client pattern from
`src/queries/element.test.ts`: a `vi.fn()`-backed `PrometheusClient` that dispatches
canned `PromSample[]` by inspecting the PromQL string, plus an assertion that **every**
issued query is correctly scoped:

```ts
const instant = vi.fn(async (q: string): Promise<PromSample[]> => {
  if (q.includes("histogram_quantile")) return [{ metric: { activity_id: "A" }, value: 15 }]
  return [{ metric: { activity_id: "A" }, value: 10 }]
})
const ch: PrometheusClient = { instant }

// …after calling the query function:
const queries = instant.mock.calls.map((c) => c[0])
expect(queries.every((q) => q.includes('process_definition_key="myKey"'))).toBe(true)
expect(queries.every((q) => q.includes("[30d]"))).toBe(true)
```

Also cover the mapping logic (ranking, thresholds, rounding, null fields), and add the
function's `SCENARIOS` entry (`src/query-scenarios.test-support.ts`) plus its `NO_DATA` and
`SCOPE_ECHO` entries in `src/query-honesty.test.ts` (Step 1).

## Step 3 — input schema

Add the tool's input schema to `packages/connectors/analytics/analytics-client/src/schemas/<topic>.ts` and
export it from `src/schemas/index.ts`. Reuse `engineFilterShape` from
`src/schemas/shared.ts` for the optional `engine` filter and `periodField` for the
`period` input (derived from `PERIODS` — never redeclare the period enum), and
`.describe()` every field (see `elementBottleneckInput` in `src/schemas/path.ts`).

## Step 4 — tool in analytics-connector

Register the tool in `packages/connectors/analytics/analytics-connector/src/tools/<topic>.ts` through the registrar
(wired in `src/tools/index.ts`). Reference — `analytics_element_bottleneck` from
`src/tools/element.ts`:

```ts
type Register = ReturnType<typeof createToolRegistrar<PrometheusClient>>

export function registerElementTools(
  register: Register,
  engineScope: AnalyticsEngineScope,
  profileStore?: ProfileSource,
) {
  register({
    name: "analytics_element_bottleneck",
    category: "analytics",
    description: "Rank activities by execution-time contribution and incident rate …",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      ...schemas.elementBottleneckInput.shape,
      period: optionalPeriod,
      minBucketSize: optionalMinBucketSize,
    },
    handler: async (ch, args, ctx) => {
      const settings = await settingsFor(profileStore, ctx)
      return queries.elementBottleneck(ch, {
        ...withEngineScope(engineScope, args),
        period: args.period ?? settings.defaultPeriod,
        minBucketSize: args.minBucketSize ?? settings.minBucketSize,
      })
    },
  })
}
```

**Engine scope:** analytics reads only the server's configured engine ids
(`src/engine-ids.ts`) — a shared Prometheus holds other teams' engines too. Every handler
passes its args through `withEngineScope(engineScope, args)` (omitted `engine` = all configured
engines, any other id refused; with none configured it refuses fail-closed); a tool that takes
engine ids by another name resolves each with `engineScope.require(id, "<field>")` (see
`analytics_engine_compare`). Never hand `args` to a query unscoped.
`src/engine-scope.test.ts` sweeps every registered Prometheus-reading tool: add the new tool
to its `ARGS` map (total over the registered surface) with valid arguments minus `engine`.

Analytics tools are read-only by nature and talk to an external Prometheus:
`{ readOnlyHint: true, idempotentHint: true, openWorldHint: true }`. The analytics registrar
is not toolset-filtered — `analytics:read-only`, the default without OAuth, stays honest only
while every registrar tool is a read. Anything that writes durably gates itself like
`analytics_save_settings` (`allowsDurableWrites` in `src/toolsets.ts`).
New domain file → add the `registerXyzTools(register, engineScope, profileStore)` call to
`registerTools` in `src/tools/index.ts`. Name the description honestly about metric
limitations (e.g. "queue/wait time is not available from metrics").

## Step 5 — dashboard widget (only for UI features)

The widget chain mirrors the camunda7 module:

1. Component in `packages/connectors/analytics/analytics-connector/src/widgets/`, taking a `data` prop.
2. Register it in `src/widgets/index.ts` in `analyticsWidgets` via
   `adaptDataWidget(MyWidget, "analytics:<dataType>")` (from
   `@miragon-ai/widget-shell/ui`).
3. Add the widget entry (`id`, `description`, `requires`/`consumes`, `size`, optional
   `propsSchema`) to `src/definition.ts`.
4. The host map `apps/mcp-server-camunda7/src/ui/widget-registry.ts` spreads
   `analyticsWidgets` — verify your widget arrives there.
5. Register an `analytics_show_*` tool in `src/widget-tools.ts` with
   `inputSchema: strictToolInput({ … })` (strict like the registrar's `strictInput`: an
   unknown key is a tool error listing the valid ones — naming per the guide in the
   add-bpm-feature skill, e.g. `maxResults`, never `limit`; `activityId`, never `elementId`) and spread `...showToolBinding(TOOL_NAME, "Title")` (from
   `@miragon-ai/widget-shell/server` — native `view` binding named after the tool + required
   passthrough `outputSchema` + the Apps-SDK `_meta` half; never hand-write
   `_meta.ui` keys, mcp-use owns them), returning `buildComposedView(...)` /
   `buildSingleWidgetView(...)` from `@miragon-ai/widget-shell/server` (see
   `analytics_show_dashboard`). An app-only `*_data` feed spreads `...appOnly`
   (`visibility: "app"` + `openai/widgetAccessible`, **no** view binding) and returns
   `buildDataFeedResult(data)`. Both resolve `engine` through `withEngineScope` like the
   registrar tools, and the payload echoes the resolved `engines` so the widget's
   `describeForModel` names the scope from the DATA (`src/widgets/model-descriptions.ts`).
   A pipeline step (`src/steps/`) reads its keys through the strict readers in
   `steps/app-config.ts` (`stepEngines`, `stepPeriod`, …) — step keys arrive unchecked, and a
   malformed one is refused, never read as "omitted".

Rules while building:

- Compose the component from `@miragon-ai/widget-shell/widgets` — `ViewDataState` for
  the loading/error/no-data guard, `Section`, `Th`/`Td`/`TableEmptyState`,
  `WidgetHeader`, `KpiGrid` (incl. `variant="soft"`), `WidgetShell`; formatting via
  `formatTimestamp`/`formatDuration`/`truncate`/… (canonical duration style "3m 7s") —
  never re-inline these primitives or write local format helpers.
- Self-fetching widgets guard skeleton + error via `QueryFallback` (+ `TableSkeleton`)
  — a missing `isError` branch means an eternal skeleton.
- Naming is load-bearing: `apps/mcp-server-camunda7/test/widget-contract.e2e.test.ts` enforces
  the widget `_meta` on every `*_show_*` tool and app-only visibility on every `*_data`
  feed **by name**; `src/widgets/catalogue-sync.test.ts` keeps `definition.ts` ↔
  `analyticsWidgets` in sync.

## Step 6 — verify

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm lint
```

A new or changed tool changes the wire surface: add its name to
`apps/mcp-server-camunda7/test/expected-tools.ts`, then refresh the per-toolset goldens with
`GOLDEN_UPDATE=1 pnpm --filter @miragon-ai/mcp-server-camunda7 test` and commit the
`test/__golden__/` diff. If `char-budgets.json` grew, `pnpm lint` fails until the commit
carries a `Ratchet-Exception: <why the model must read more>` trailer — trim wording first.
A camunda7 widget that names an analytics feed by raw string is checked against the booted
surface by `test/tool-name-refs.test.ts` — renaming a feed fails there.

`pnpm test` runs the query snapshot tests; `pnpm typecheck` is the **only** check that
covers widget `.tsx` code (`tsc -p tsconfig.widgets.json`). For end-to-end verification:
`docker compose -f playground/docker/docker-compose.yml up -d` (engines + Prometheus emit real
metrics), `pnpm dev`, then call the tool in the inspector at
`http://localhost:8400/mcp/inspector`. Run `pnpm format:check` before committing.
