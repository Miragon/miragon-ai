# @miragon-ai/analytics-connector

The **analytics module** for [Miragon AI](../../../../README.md): Prometheus-backed process analytics as
`analytics_*` MCP tools, plus dashboard and comparison widgets. Built on
[`@miragon-ai/analytics-client`](../analytics-client) and the `@miragon/mcp-toolkit-*` packages.

The server loads this module as `analytics` via `analyticsModule` (`src/module.ts`), which conforms
structurally to the app's `ModuleDefinition` port. The package is published to npm in lockstep with
the other `@miragon-ai` packages (pin them all to one version); the
[miragon-ai-starter](https://github.com/Miragon/miragon-ai-starter) template shows how to compose it
into your own MCP server.

## What it provides

- **Analytics tools** (`src/tools/`) — `analyze_process_performance`, `compare_execution_periods`,
  `element_bottleneck`, `find_failed_instances`, `cluster_compare`, `version_compare`,
  `engine_landscape`, `engine_compare`, and `engine_health` (a live WIP / incidents / backlog /
  alerts snapshot). All carry the `analytics` category and run PromQL through
  [`@miragon-ai/analytics-client`](../analytics-client).
- **Widgets** (`src/widgets/`) — `show_dashboard`, `show_failure_dashboard`, `show_cluster_compare`,
  `show_version_compare`, `show_engine_landscape`, `show_engine_compare`, `show_bpmn_heatmap`.
- **Engine-aware** — every tool accepts an optional `engine` filter (single id or list) so a single
  dashboard can aggregate across CIB Seven instances; analytics are session-independent.

### Cross-engine: overview, not scoreboard

Engines host different process definitions, so a failure rate, incident rate or duration aggregated
per engine describes that engine's **process mix**, not the engine — the same aggregation can even
invert the per-process truth. Two consequences run through the module:

- `engine_landscape` is the cross-engine view. It reports the process × engine inventory, absolute
  counts (running instances, open incidents, failed jobs) and the engine-owned job backlog
  (`jobs_executable`, `jobs_suspended`, `jobs_due_future`, `external_tasks_open`) — the one metric
  family whose contract labels are `engine_id` only, so no process mix can confound it. Pass the
  full configured engine list to surface engines that report nothing (`reporting: false`).
- `engine_compare` **requires** a `processDefinitionKey`. Holding the process fixed on both sides is
  what makes a delta attributable to the engine; `engine_landscape.sharedProcessKeys` lists the
  definitions that qualify.

These tools read the `camunda_*` series emitted by the
[engine metrics plugin](../../../../engine-plugins). Per-instance drill-down (search by variable) is **not**
metric-backed — use the `camunda7_query_historic_*` tools in the [camunda7 module](../../camunda/camunda7-connector).

The BPMN heatmap gets its diagram XML via an injected `fetchBpmnXml` shared resource (wired by the
host app from the camunda7 module) — this package has **no** engine-SDK dependency and the heatmap
degrades gracefully without it.

## Adding an analytics capability

Read the [`add-analytics-feature`](../../../../.claude/skills/add-analytics-feature) skill first. The house
pattern: add a PromQL query function in [`@miragon-ai/analytics-client`](../analytics-client) (using
`METRIC_NAMES`, never raw metric strings), then a tool here, then optionally a widget. Metric names
and labels are governed by the
[metrics contract](../analytics-client/metrics-contract.json) — change it there first.

## Layout

| Path                  | Contents                                                    |
| --------------------- | ----------------------------------------------------------- |
| `src/tools/`          | Analytics tools (`index.ts` wires them)                     |
| `src/widget-tools.ts` | `show_*` dashboard/comparison widget tools                  |
| `src/widgets/`        | React dashboard + comparison widgets                        |
| `src/definition.ts`   | Widget metadata                                             |
| `src/module.ts`       | `analyticsModule` (env mapping, `PROMETHEUS_URL` boot hint) |
| `src/steps/`          | Pipeline steps contributed to the server                    |
