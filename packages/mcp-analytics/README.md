# @miragon-ai/mcp-analytics

The **analytics module** for [Miragon AI](../../README.md): Prometheus-backed process analytics as
`analytics_*` MCP tools, plus dashboard and comparison widgets. Built on
[`@miragon-ai/client-analytics`](../client-analytics) and the `@miragon/mcp-toolkit-*` packages.

The server loads this module as `analytics` via `analyticsModule` (`src/module.ts`), which conforms
structurally to the app's `ModuleDefinition` port. The package is `private` and not published to npm.

## What it provides

- **Analytics tools** (`src/tools/`) — `analyze_process_performance`, `compare_execution_periods`,
  `element_bottleneck`, `find_failed_instances`, `cluster_compare`, `version_compare`,
  `engine_compare`, and `engine_health` (a live WIP / incidents / backlog / alerts snapshot). All
  carry the `analytics` category and run PromQL through
  [`@miragon-ai/client-analytics`](../client-analytics).
- **Widgets** (`src/widgets/`) — `show_dashboard`, `show_failure_dashboard`, `show_cluster_compare`,
  `show_version_compare`, `show_engine_compare`, `show_bpmn_heatmap`.
- **Engine-aware** — every tool accepts an optional `engine` filter (single id or list) so a single
  dashboard can aggregate or compare across CIB Seven instances; analytics are session-independent.

These tools read the `camunda_*` series emitted by the
[engine metrics plugin](../../engine-plugins). Per-instance drill-down (search by variable) is **not**
metric-backed — use the `camunda7_query_historic_*` tools in the [camunda7 module](../mcp-camunda7).

The BPMN heatmap gets its diagram XML via an injected `fetchBpmnXml` shared resource (wired by the
host app from the camunda7 module) — this package has **no** engine-SDK dependency and the heatmap
degrades gracefully without it.

## Adding an analytics capability

Read the [`add-analytics-feature`](../../.claude/skills/add-analytics-feature) skill first. The house
pattern: add a PromQL query function in [`@miragon-ai/client-analytics`](../client-analytics) (using
`METRIC_NAMES`, never raw metric strings), then a tool here, then optionally a widget. Metric names
and labels are governed by the
[metrics contract](../client-analytics/metrics-contract.json) — change it there first.

## Layout

| Path                  | Contents                                                    |
| --------------------- | ----------------------------------------------------------- |
| `src/tools/`          | Analytics tools (`index.ts` wires them)                     |
| `src/widget-tools.ts` | `show_*` dashboard/comparison widget tools                  |
| `src/widgets/`        | React dashboard + comparison widgets                        |
| `src/definition.ts`   | Widget metadata                                             |
| `src/module.ts`       | `analyticsModule` (env mapping, `PROMETHEUS_URL` boot hint) |
| `src/steps/`          | Pipeline steps contributed to the server                    |
