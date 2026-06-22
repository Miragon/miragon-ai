# @miragon-ai/client-analytics

Prometheus client and PromQL query layer for Camunda 7 / CIB Seven process analytics. It pairs a thin
HTTP client for the Prometheus query API with a set of typed, purpose-built query functions and the
**metrics contract** — the single source of truth for the `camunda_*` metric names and labels the
[engine plugin](../../engine-plugins) emits.

Used by [`@miragon-ai/mcp-analytics`](../mcp-analytics) to power the `analytics_*` MCP tools, but
usable by any project that reads Camunda process metrics from Prometheus.

## Exports

| Subpath     | Contents                                                                               |
| ----------- | -------------------------------------------------------------------------------------- |
| `.`         | Prometheus client + `METRIC_NAMES` + query re-exports                                  |
| `./queries` | Typed PromQL query functions (performance, bottlenecks, failures, comparisons, health) |
| `./schemas` | Zod input schemas for the query functions                                              |
| `./widgets` | Shared widget data types for the analytics dashboards                                  |

## Query functions

`src/queries/` provides one composable function per analysis, each returning a typed result rather
than a raw Prometheus matrix:

- `performance` — throughput, duration percentiles over a window
- `element` — per-activity bottleneck analysis
- `failures` — failed / incident-bearing instances
- `cluster-compare`, `version-compare`, `engine-compare` — side-by-side comparisons
- `health` — live operational snapshot (running WIP, open incidents, dead jobs, backlog, alerts)
- `dashboard` — the aggregate feed behind the analytics dashboard widget

```ts
import { createPrometheusClient } from "@miragon-ai/client-analytics"
import { analyzePerformance } from "@miragon-ai/client-analytics/queries"

const prom = createPrometheusClient({ url: "http://localhost:9090" })
const perf = await analyzePerformance(prom, {
  processDefinitionKey: "loanApproval",
  period: "24h",
  includeActivityBreakdown: true,
})
```

## Metrics contract

[`metrics-contract.json`](metrics-contract.json) is the **single source of truth** for metric names
and labels. The Kotlin plugin emits the OTEL instruments (`otelName`) that surface in Prometheus as
`camunda_*` series (`promName`), and consumers reference them through `METRIC_NAMES`
([`src/metric-names.ts`](src/metric-names.ts)) — **never raw strings**. Both sides are verified
against the contract:

- TypeScript: [`src/metrics-contract.test.ts`](src/metrics-contract.test.ts) (vitest)
- Kotlin: `MetricsContractTest.kt` (Gradle)

A rename that skips the contract — or a consumer (queries, alert rules, Grafana dashboards) — fails
one of these tests. Only attach model-bounded labels (definition key, activity id, engine id);
never instance ids, business keys, or variable values.

## Publishing

Published to GitHub Packages (`npm.pkg.github.com`, restricted access) via release-please. The
`metrics-contract.json` ships in the package so downstream consumers can validate against it.
