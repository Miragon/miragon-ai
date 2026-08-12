import type {
  AnalyticsDashboardData,
  CompareKpiDelta,
  FailureDashboardData,
} from "@miragon-ai/client-analytics"
import { formatDuration, truncate, type BpmnHeatmapData } from "@miragon-ai/widget-shell/widgets"
import type { DescribeForModel } from "@miragon-ai/widget-shell/ui"
import type { ClusterCompareData } from "./cluster-compare.js"
import type { VersionCompareData } from "./version-compare.js"
import type { EngineCompareData } from "./engine-compare.js"
import type { EngineLandscapeData } from "./engine-landscape.js"
import type { AnalyticsSettingsViewData } from "./settings-section.js"

/**
 * Model-context descriptions for every analytics widget, attached centrally via
 * `adaptDataWidget(..., describe)` in `widgets/index.ts`. Each line follows the
 * house pattern from `mcp-camunda7/.../process-instances/list.tsx`: view
 * identity + active filters + the headline number(s) a user is most likely to
 * ask about, plus the natural follow-up tool(s).
 *
 * Scope filters (`processDefinitionKey`, `period`, `engine`) only travel as
 * layout-cell props — the dashboard data does not echo them — so the helpers
 * read the props bag and fall back to the server-side defaults where a prop is
 * absent (standalone `analytics_show_*` calls pass no widget props).
 */

function strProp(props: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = props[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/** ` on engine "x"` / ` on engines "a", "b"` when scoped via props, else "". */
function engineScope(props: Readonly<Record<string, unknown>>): string {
  const value = props.engine
  if (typeof value === "string" && value.length > 0) return ` on engine "${value}"`
  if (Array.isArray(value)) {
    const ids = value.filter((id): id is string => typeof id === "string" && id.length > 0)
    if (ids.length > 0) return ` on engines ${ids.map((id) => `"${id}"`).join(", ")}`
  }
  return ""
}

/** Shared scope line for the four split analytics-dashboard widgets. */
function dashboardScope(
  data: AnalyticsDashboardData,
  props: Readonly<Record<string, unknown>>,
): string {
  const processDefinitionKey = strProp(props, "processDefinitionKey")
  // The show tool passes the RESOLVED period as a cell prop; a prop-less
  // render self-fetches, where the feed applies the saved profile default.
  const period = strProp(props, "period") ?? "the profile default period"
  const scope = processDefinitionKey
    ? `process "${processDefinitionKey}"`
    : `${data.definitionBreakdown.length} process definition(s)`
  return `${scope} over ${period}${engineScope(props)}`
}

export const describeExecutionSummary: DescribeForModel<AnalyticsDashboardData> = (data, props) =>
  `Viewing the process-analytics dashboard (execution summary) for ${dashboardScope(data, props)}: ` +
  `${data.totalCount} instances — ${data.completedCount} completed, ${data.runningCount} running, ` +
  `${data.failedCount} failed, ${data.incidentCount} open incident(s), failure rate ${data.failureRatePct}%. ` +
  `Drill deeper with analytics_analyze_process_performance or analytics_find_failed_instances.`

export const describeExecutionPerformance: DescribeForModel<AnalyticsDashboardData> = (
  data,
  props,
) =>
  `Viewing the process-analytics performance KPIs for ${dashboardScope(data, props)}: ` +
  `avg duration ${formatDuration(data.avgDurationMs)}, median ${formatDuration(data.medianDurationMs)}, ` +
  `p95 ${formatDuration(data.p95DurationMs)}, failure rate ${data.failureRatePct}%. ` +
  `Find the slow step with analytics_element_bottleneck.`

export const describeDefinitionBreakdown: DescribeForModel<AnalyticsDashboardData> = (
  data,
  props,
) => {
  const top = [...data.definitionBreakdown].sort((a, b) => b.totalInstances - a.totalInstances)[0]
  return (
    `Viewing the per-definition breakdown for ${dashboardScope(data, props)}` +
    `${
      top
        ? `; busiest "${top.processDefinitionKey}" with ${top.totalInstances} instances (${top.failed} failed)`
        : ""
    }. ` +
    `Scope to one process with analytics_show_dashboard({ processDefinitionKey }).`
  )
}

export const describeActivityBottlenecks: DescribeForModel<AnalyticsDashboardData> = (
  data,
  props,
) => {
  const top = [...data.activityBreakdown].sort((a, b) => b.totalTimeMs - a.totalTimeMs)[0]
  return (
    `Viewing the activity-bottleneck table for ${dashboardScope(data, props)}: ` +
    `${data.activityBreakdown.length} activities` +
    `${
      top
        ? `; top bottleneck "${top.activityName || top.activityId}" (${top.activityId}) — ` +
          `${top.executionCount} executions, total ${formatDuration(top.totalTimeMs)}, ` +
          `p95 ${formatDuration(top.p95DurationMs)}`
        : ""
    }. ` +
    `Investigate with analytics_element_bottleneck.`
  )
}

/** Shared lead-in for the three failure-dashboard widgets (point-in-time, no period). */
function failureScope(props: Readonly<Record<string, unknown>>): string {
  return `(point-in-time open incidents${engineScope(props)})`
}

export const describeFailureSummary: DescribeForModel<FailureDashboardData> = (data, props) =>
  `Viewing the failure dashboard ${failureScope(props)}: ${data.totalIncidents} open incident(s) ` +
  `across ${data.uniqueErrorPatterns} error pattern(s)` +
  `${data.mostAffectedProcess ? `; most affected process "${data.mostAffectedProcess}"` : ""}. ` +
  `Drill in with analytics_find_failed_instances or camunda7_list_incidents.`

export const describeErrorPatterns: DescribeForModel<FailureDashboardData> = (data, props) => {
  const top = [...data.errorPatterns].sort((a, b) => b.incidentCount - a.incidentCount)[0]
  return (
    `Viewing the error-patterns table ${failureScope(props)}: ${data.errorPatterns.length} pattern(s)` +
    `${
      top
        ? `; top: "${truncate(top.incidentMessage, 100)}" at activity ${top.activityId} ` +
          `in "${top.processDefinitionKey}" (${top.incidentCount}×)`
        : ""
    }. ` +
    `Root-cause with analytics_find_failed_instances + camunda7_list_incidents.`
  )
}

export const describeFailureRates: DescribeForModel<FailureDashboardData> = (data, props) => {
  const top = [...data.processBreakdown].sort((a, b) => b.failureRatePct - a.failureRatePct)[0]
  return (
    `Viewing failure rates by process ${failureScope(props)}: ${data.processBreakdown.length} process(es)` +
    `${
      top
        ? `; highest "${top.processDefinitionKey}" at ${top.failureRatePct}% ` +
          `(${top.failedCount}/${top.totalInstances} failed, ${top.incidentCount} incident(s))`
        : ""
    }. ` +
    `Check for regressions with analytics_version_compare.`
  )
}

/**
 * Names the single largest delta on screen — the number a user asks about
 * first. The candidates list is hand-enumerated: a new `CompareKpiDelta` field
 * must be added here too — the shared import alone does not auto-heal it.
 */
function mostNotableDelta(delta: CompareKpiDelta): string {
  const candidates = [
    { label: "failure rate", value: delta.failure_rate_delta_pp, unit: "pp" },
    { label: "incident rate", value: delta.incident_rate_delta_pp, unit: "pp" },
    { label: "avg duration", value: delta.avg_duration_delta_pct, unit: "%" },
    { label: "p95 duration", value: delta.p95_duration_delta_pct, unit: "%" },
    { label: "instance count", value: delta.instance_count_delta_pct, unit: "%" },
  ].filter(
    (c): c is { label: string; value: number; unit: string } => c.value != null && c.value !== 0,
  )
  if (candidates.length === 0) return "no metric moved"
  const top = candidates.reduce((max, c) => (Math.abs(c.value) > Math.abs(max.value) ? c : max))
  return `most notable delta: ${top.label} ${top.value > 0 ? "+" : ""}${top.value}${top.unit}`
}

const suppressedNote = (suppressed: boolean): string =>
  suppressed ? " — flagged suppressed (sample below minBucketSize, treat as noise)" : ""

export const describeClusterCompare: DescribeForModel<ClusterCompareData> = (data) =>
  `Comparing pre/post deployment KPIs around ${data.deploymentTimestamp} ` +
  `(-${data.windowDays.before}d/+${data.windowDays.after}d)` +
  `${data.processDefinitionKey ? ` for process "${data.processDefinitionKey}"` : " cluster-wide"}` +
  `${data.elementId ? `, element ${data.elementId}` : ""}: ${mostNotableDelta(data.delta)}` +
  `${suppressedNote(data.suppressed)}. ` +
  `Confirm with analytics_cluster_compare; find the driving activity with analytics_element_bottleneck.`

export const describeVersionCompare: DescribeForModel<VersionCompareData> = (data) =>
  `Comparing process "${data.processDefinitionKey}" v${data.versionA} (baseline) vs ` +
  `v${data.versionB} over a ${data.windowDays}d window` +
  `${data.elementId ? `, element ${data.elementId}` : ""}: ${mostNotableDelta(data.delta)}` +
  `${suppressedNote(data.suppressed)}. ` +
  `Confirm with analytics_version_compare; find the driving activity with analytics_element_bottleneck.`

export const describeEngineCompare: DescribeForModel<EngineCompareData> = (data) =>
  `Comparing process "${data.processDefinitionKey}" on engine "${data.engineA}" (baseline) vs ` +
  `"${data.engineB}" over ${data.windowDays}d` +
  `${data.elementId ? `, element ${data.elementId}` : ""}: ` +
  `${mostNotableDelta(data.delta)}${suppressedNote(data.suppressed)}. ` +
  `The process is held fixed, so the delta is attributable to the engine rather than to a ` +
  `different workload. Confirm with analytics_engine_compare; per-engine ops snapshot via ` +
  `analytics_engine_health; the cross-engine picture via analytics_engine_landscape.`

export const describeEngineLandscape: DescribeForModel<EngineLandscapeData> = (data) => {
  const { totals } = data
  const silent = data.engines.filter((e) => !e.reporting).map((e) => e.engineId)
  const busiest = [...data.engines].sort((a, b) => b.runningInstances - a.runningInstances)[0]
  const backlog = [...data.engines].sort((a, b) => b.executableJobs - a.executableJobs)[0]
  return (
    `Viewing the cross-engine landscape: ${totals.engineCount} engine(s), ` +
    `${totals.processKeyCount} process definition(s), ${totals.runningInstances} running ` +
    `instance(s), ${totals.openIncidents} open incident(s)` +
    `${silent.length ? `; reporting NO metrics: ${silent.join(", ")}` : ""}` +
    `${busiest ? `; most running work on "${busiest.engineId}" (${busiest.runningInstances})` : ""}` +
    `${backlog && backlog.executableJobs > 0 ? `; largest job backlog on "${backlog.engineId}" (${backlog.executableJobs} executable)` : ""}. ` +
    `These are absolute counts and the process-independent job backlog on purpose: engines run ` +
    `different process mixes, so per-engine failure rates or durations would describe the mix, ` +
    `not the engine. ` +
    (data.sharedProcessKeys.length
      ? `A KPI comparison is only sound for the definition(s) deployed on several engines: ` +
        `${data.sharedProcessKeys.join(", ")} — use analytics_engine_compare with that ` +
        `processDefinitionKey. `
      : `No definition runs on more than one engine, so there is no valid engine-vs-engine KPI ` +
        `comparison here. `) +
    `Per-engine ops detail via analytics_engine_health.`
  )
}

function maxEntry(values: Record<string, number>): [string, number] | null {
  let best: [string, number] | null = null
  for (const [key, value] of Object.entries(values)) {
    if (!best || value > best[1]) best = [key, value]
  }
  return best
}

export const describeAnalyticsSettings: DescribeForModel<AnalyticsSettingsViewData> = (data) =>
  `Viewing the analytics settings section: default period ${data.settings.defaultPeriod}, ` +
  `min bucket size ${data.settings.minBucketSize}. These apply whenever an analytics call ` +
  `omits period/minBucketSize` +
  `${data.canSave ? "; change them here or via analytics_save_settings" : " (read-only in this deployment)"}.`

export const describeBpmnHeatmap: DescribeForModel<BpmnHeatmapData> = (data) => {
  const hottest = maxEntry(data.frequency)
  const slowest = maxEntry(data.durationSec)
  return (
    `Viewing the BPMN heatmap for process "${data.processDefinitionKey}" over ${data.period}: ` +
    `heat on ${Object.keys(data.frequency).length} element(s)` +
    `${hottest ? `; hottest "${hottest[0]}" (${hottest[1]} executions)` : ""}` +
    `${slowest ? `, slowest "${slowest[0]}" (avg ${Math.round(slowest[1] * 10) / 10}s)` : ""}. ` +
    `The frequency↔duration toggle is client-side. Quantify a hotspot with ` +
    `analytics_element_bottleneck({ processDefinitionKey: "${data.processDefinitionKey}" }).`
  )
}
