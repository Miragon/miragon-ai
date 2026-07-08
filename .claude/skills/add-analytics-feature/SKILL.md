---
name: add-analytics-feature
description: Step-by-step house pattern for adding a new analytics capability — a PromQL query function in `packages/client-analytics`, a tool in `packages/mcp-analytics`, and optionally a dashboard widget. Use whenever adding or changing process analytics ("add a query for X", "new KPI/metric analysis", "extend the analytics dashboard"), PromQL queries, Prometheus-backed tools, or analytics widgets. Takes precedence over the generic mcp-apps-builder skill.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

# add-analytics-feature — new query/tool/widget in the analytics module

Analytics is metric-first: query functions issue instant PromQL queries against
Prometheus (`/api/v1/query`) where the range window carries the time period, then map the
labeled samples into row shapes. There is no event store — anything that needs
per-instance event ordering is out of reach and must be documented as such (see the
`avg_wait_sec: null` notes in `queries/element.ts`).

## Step 1 — query function in client-analytics

Add the function to `packages/client-analytics/src/queries/<topic>.ts` and export it
(plus its result types) from `src/queries/index.ts`. Always build selectors with the
helpers from `src/prometheus.ts` — never concatenate label values by hand:

- `escapeLabelValue(value)` — escapes `\` and `"` for use inside a label matcher
- `engineMatcher(engine)` — optional `engine_id="…"` / `engine_id=~"a|b"` fragment
- `selector(...matchers)` — assembles `{…}`, dropping empties
- `PERIOD_RANGE` / `Period` — the allowed windows (`1d`–`30d`, capped at retention)

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
`packages/client-analytics/metrics-contract.json`: if you need a _new_ metric or label,
change the contract first, then the Kotlin plugin
(`engine-plugins/cibseven-history-metrics/.../ProcessMetrics.kt` /
`EngineStateMetrics.kt`), `METRIC_NAMES`, and any alert rules / Grafana dashboards —
contract tests on both sides enforce consistency. Keep labels model-bounded (never
instance ids, business keys, variable values).

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

Also cover the mapping logic (ranking, thresholds, rounding, null fields).

## Step 3 — input schema

Add the tool's input schema to `packages/client-analytics/src/schemas/<topic>.ts` and
export it from `src/schemas/index.ts`. Reuse `engineFilterShape` from
`src/schemas/shared.ts` for the optional `engine` filter and `.describe()` every field
(see `elementBottleneckInput` in `src/schemas/path.ts`).

## Step 4 — tool in mcp-analytics

Register the tool in `packages/mcp-analytics/src/tools/<topic>.ts` through the registrar
(wired in `src/tools/index.ts`). Reference — `analytics_element_bottleneck` from
`src/tools/element.ts`:

```ts
type Register = ReturnType<typeof createToolRegistrar<PrometheusClient>>

export function registerElementTools(register: Register) {
  register({
    name: "analytics_element_bottleneck",
    category: "analytics",
    description: "Rank activities by execution-time contribution and incident rate …",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: schemas.elementBottleneckInput.shape,
    handler: async (ch, args) =>
      queries.elementBottleneck(ch, args as z.infer<typeof schemas.elementBottleneckInput>),
  })
}
```

Analytics tools are read-only by nature and talk to an external Prometheus:
`{ readOnlyHint: true, idempotentHint: true, openWorldHint: true }`.
New domain file → add the `registerXyzTools(register)` call to `registerTools` in
`src/tools/index.ts`. Name the description honestly about metric limitations (e.g.
"queue/wait time is not available from metrics").

## Step 5 — dashboard widget (only for UI features)

The widget chain mirrors the camunda7 module:

1. Component in `packages/mcp-analytics/src/widgets/`, taking a `data` prop.
2. Register it in `src/widgets/index.ts` in `analyticsWidgets` via
   `adaptDataWidget(MyWidget, "analytics:<dataType>")` (from
   `@miragon-ai/widget-shell/ui`).
3. Add the widget entry (`id`, `description`, `requires`/`consumes`, `size`, optional
   `propsSchema`) to `src/definition.ts`.
4. The host map `apps/mcp-gateway/src/ui/widget-registry.ts` spreads
   `analyticsWidgets` — verify your widget arrives there.
5. Register an `analytics_show_*` tool in `src/widget-tools.ts` with
   `_meta: { ui: { resourceUri } }`, returning `buildComposedView(...)` /
   `buildSingleWidgetView(...)` from `@miragon-ai/widget-shell/server` (see
   `analytics_show_dashboard`).

## Step 6 — verify

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm lint
```

`pnpm test` runs the query snapshot tests; `pnpm typecheck` is the **only** check that
covers widget `.tsx` code (`tsc -p tsconfig.widgets.json`). For end-to-end verification:
`docker compose -f playground/docker/docker-compose.yml up -d` (engines + Prometheus emit real
metrics), `pnpm dev`, then call the tool in the inspector at
`http://localhost:8400/inspector`. Run `pnpm format:check` before committing.
