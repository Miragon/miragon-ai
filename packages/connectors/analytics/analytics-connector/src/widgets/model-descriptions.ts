import type {
  AnalyticsDashboardData,
  CompareKpiDelta,
  FailureDashboardData,
} from "@miragon-ai/analytics-client"
import {
  formatDuration,
  modelContextText,
  type ModelContextSpec,
} from "@miragon-ai/widget-shell/widgets"
import type { DescribeForModel } from "@miragon-ai/widget-shell/ui"
import { ANALYTICS_ONLY_SURFACE, engineIdsOf, isAggregate } from "./hand-off.js"
import type { ClusterCompareData } from "./cluster-compare.js"
import type { VersionCompareData } from "./version-compare.js"
import type { EngineCompareData } from "./engine-compare.js"
import type { EngineLandscapeData } from "./engine-landscape.js"
import type { AnalyticsSettingsViewData } from "./settings-section.js"
import type { AnalyticsBpmnHeatmapData } from "./bpmn-heatmap.js"
import { versionCompareCaveats } from "../version-compare-caveats.js"

/**
 * Model-context descriptions for every analytics widget, attached centrally via
 * `adaptDataWidget(..., describe)` in `widgets/index.ts`. Each line follows the
 * house pattern from `camunda7-connector/.../process-instances/list.tsx`: view
 * identity + active filters + the headline number(s) a user is most likely to
 * ask about, plus the natural follow-up tool(s).
 *
 * The scope comes from the DATA, never from the cell props: every analytics
 * result echoes what it covers (process key, period, `engines`), so a widget
 * that self-fetched, was saved or composed by render-view describes exactly
 * the numbers on screen — including which engines a fleet aggregate adds up.
 */

/**
 * ` on engine "a"` / ` across engines "a", "b" (aggregated)` from a result's
 * `engines` echo; "" for an unscoped library result (`null`).
 */
function engineScope(engines: readonly string[] | null): string {
  if (!engines || engines.length === 0) return ""
  if (engines.length === 1) return ` on engine "${engines[0]}"`
  return ` across engines ${engines.map((id) => `"${id}"`).join(", ")} (aggregated)`
}

/** A figure that was not measured reads "not measured" — never a plausible 0. */
const measured = (value: number | null, unit = ""): string =>
  value === null ? "not measured" : `${value}${unit}`

/** Said whenever a figure adds up several engines (the deliberate fleet aggregate). */
const AGGREGATED = " The figures add up every engine listed (aggregated)."

/** Shared scope line for the four split analytics-dashboard widgets. */
function dashboardScope(data: AnalyticsDashboardData): string {
  const scope = data.processDefinitionKey
    ? `process "${data.processDefinitionKey}"`
    : `${data.definitionBreakdown.length} process definition(s)`
  return `${scope} over ${data.period}${engineScope(data.engines)}`
}

export const describeExecutionSummary: DescribeForModel<AnalyticsDashboardData> = (data) =>
  `Viewing the process-analytics dashboard (execution summary) for ${dashboardScope(data)}: ` +
  `within the period ${data.totalCount} instance(s) started, ${data.completedCount} completed, ` +
  `${data.incidentsCreated} incident(s) created (incidents, not failed instances); right now ` +
  `${measured(data.runningNow)} running and ${measured(data.openIncidentsNow)} incident(s) open ` +
  `(live gauges, independent of the period). ` +
  `Drill deeper with analytics_analyze_process_performance or analytics_find_failed_instances.`

export const describeExecutionPerformance: DescribeForModel<AnalyticsDashboardData> = (data) =>
  `Viewing the process-analytics performance KPIs for ${dashboardScope(data)}: ` +
  `durations of the instances that ended in the period — avg ${formatDuration(data.avgDurationMs)}, ` +
  `median ${formatDuration(data.medianDurationMs)}, p95 ${formatDuration(data.p95DurationMs)}` +
  `${data.avgDurationMs === null ? " (none ended)" : ""}; ` +
  `${measured(data.incidentRatePct, "%")} incidents per 100 started instances. ` +
  `Find the slow step with analytics_element_bottleneck.`

export const describeDefinitionBreakdown: DescribeForModel<AnalyticsDashboardData> = (data) => {
  const top = [...data.definitionBreakdown].sort((a, b) => b.totalInstances - a.totalInstances)[0]
  return (
    `Viewing the per-definition breakdown for ${dashboardScope(data)}` +
    `${
      top
        ? `; busiest "${top.processDefinitionKey}" with ${top.totalInstances} instance(s) started ` +
          `(${top.incidentsCreated} incident(s) created, ${measured(top.runningNow)} running now)`
        : ""
    }. ` +
    `Scope to one process with analytics_show_dashboard({ processDefinitionKey }).`
  )
}

/**
 * The bottleneck table: one row per (process, activity) — BPMN ids are only
 * unique within one model, so the top row names its process too.
 */
export const describeActivityBottlenecks: DescribeForModel<AnalyticsDashboardData> = (data) => {
  const top = [...data.activityBreakdown].sort((a, b) => b.totalTimeMs - a.totalTimeMs)[0]
  return modelContextText({
    summary:
      "The operator is viewing the activity-bottleneck table of the process analytics: one row per (process, activity)." +
      (isAggregate(data.engines) ? AGGREGATED : ""),
    ids: {
      engine: engineIdsOf(data.engines),
      processDefinitionKey: data.processDefinitionKey ?? undefined,
      period: data.period,
    },
    facts: {
      rows: data.activityBreakdown.length,
      topProcessDefinitionKey: top?.processDefinitionKey,
      topActivityId: top?.activityId,
      topExecutions: top?.executionCount,
      topTotalTimeMs: top?.totalTimeMs,
      topP95DurationMs: top?.p95DurationMs,
    },
    tools: ["analytics_element_bottleneck"],
    surface: ANALYTICS_ONLY_SURFACE,
  })
}

/** Shared lead-in for the three failure-dashboard widgets (point-in-time, no period). */
function failureScope(data: FailureDashboardData): string {
  return `(incidents open right now${engineScope(data.engines)})`
}

/**
 * The failure summary (point-in-time). A pure description cannot query the
 * camunda7 surface, so it names analytics tools only; the Ask-AI hand-off
 * (live surface) adds the camunda7 ones where the deployment has them.
 */
export const describeFailureSummary: DescribeForModel<FailureDashboardData> = (data) =>
  modelContextText({
    summary:
      "The operator is viewing the failure dashboard: the incidents open right now (point-in-time, no period), grouped by incident type and process." +
      (isAggregate(data.engines) ? AGGREGATED : ""),
    ids: { engine: engineIdsOf(data.engines) },
    facts: {
      openIncidents: data.totalIncidents,
      incidentGroups: data.uniqueErrorPatterns,
      mostAffectedProcess: data.mostAffectedProcess,
    },
    tools: ["analytics_find_failed_instances"],
    surface: ANALYTICS_ONLY_SURFACE,
  })

/**
 * The open-incident groups. The gauge carries only incident type, process and
 * count — no message, activity or timestamps. A custom incident type is any
 * string: unless id-shaped it is quoted as untrusted data (#338).
 */
export const describeErrorPatterns: DescribeForModel<FailureDashboardData> = (data) => {
  const top = [...data.errorPatterns].sort((a, b) => b.incidentCount - a.incidentCount)[0]
  return modelContextText({
    summary:
      "The operator is viewing the incidents open right now (point-in-time), grouped by incident type and process; the metric carries no message, activity or timestamps." +
      (isAggregate(data.engines) ? AGGREGATED : ""),
    ids: { engine: engineIdsOf(data.engines), processDefinitionKey: top?.processDefinitionKey },
    // A value that is not id-shaped moves into the untrusted fence by itself.
    facts: {
      groups: data.errorPatterns.length,
      largestGroupIncidentType: top?.incidentType,
      largestGroupIncidents: top?.incidentCount,
    },
    tools: ["analytics_find_failed_instances"],
    surface: ANALYTICS_ONLY_SURFACE,
  })
}

export const describeFailureRates: DescribeForModel<FailureDashboardData> = (data) => {
  const top = [...data.processBreakdown].sort(
    (a, b) => (b.incidentRatePct ?? -1) - (a.incidentRatePct ?? -1),
  )[0]
  return (
    `Viewing open incidents by process ${failureScope(data)}: ${data.processBreakdown.length} process(es)` +
    `${
      top
        ? `; highest rate "${top.processDefinitionKey}" with ${top.openIncidents} open incident(s) ` +
          `on ${top.runningNow} running instance(s) (${measured(top.incidentRatePct, "%")}), ` +
          `${top.deadJobs} dead job(s)`
        : ""
    }. ` +
    // Not analytics_version_compare: it cannot split incidents by version, so
    // its incident rates are null (#327).
    `Check for a regression period over period with analytics_compare_execution_periods, ` +
    `or around a deployment with analytics_cluster_compare.`
  )
}

/**
 * Names the single largest delta on screen — the number a user asks about
 * first. The candidates list is hand-enumerated: a new `CompareKpiDelta` field
 * must be added here too — the shared import alone does not auto-heal it.
 */
function mostNotableDelta(delta: CompareKpiDelta): string {
  const candidates = [
    { label: "incident rate", value: delta.incident_rate_delta_pp, unit: "pp" },
    { label: "element incident rate", value: delta.element_incident_rate_delta_pp, unit: "pp" },
    { label: "avg duration", value: delta.avg_duration_delta_pct, unit: "%" },
    { label: "p95 duration", value: delta.p95_duration_delta_pct, unit: "%" },
    { label: "starts per day", value: delta.started_per_day_delta_pct, unit: "%" },
  ].filter(
    (c): c is { label: string; value: number; unit: string } => c.value != null && c.value !== 0,
  )
  if (candidates.length === 0) return "no measured metric moved"
  const top = candidates.reduce((max, c) => (Math.abs(c.value) > Math.abs(max.value) ? c : max))
  return `most notable delta: ${top.label} ${top.value > 0 ? "+" : ""}${top.value}${top.unit}`
}

const suppressedNote = (suppressed: boolean): string =>
  suppressed ? " — flagged suppressed (sample below minBucketSize, treat as noise)" : ""

export const describeClusterCompare: DescribeForModel<ClusterCompareData> = (data) =>
  `Comparing pre/post deployment KPIs around ${data.deploymentTimestamp} ` +
  `(measured -${data.windowDays.before}d/+${data.windowDays.after}d` +
  `${data.partial ? ", partial: a window was cut short at now or the retention — starts compare per day" : ""})` +
  `${data.processDefinitionKey ? ` for process "${data.processDefinitionKey}"` : " cluster-wide"}` +
  `${engineScope(data.engines)}` +
  `${data.activityId ? `, element ${data.activityId}` : ""}: ${mostNotableDelta(data.delta)}` +
  `${suppressedNote(data.suppressed)}. ` +
  `Durations cover only instances that ended in a window. ` +
  `Confirm with analytics_cluster_compare; find the driving activity with analytics_element_bottleneck.`

/**
 * Version compare: the incident metric has no version label, so its rates come
 * back null — said in so many words, never left to read as zero.
 */
export const describeVersionCompare: DescribeForModel<VersionCompareData> = (data) => {
  const { incidentRatesUnavailable } = versionCompareCaveats(data)
  return (
    `Comparing process "${data.processDefinitionKey}" v${data.versionA} (baseline) vs ` +
    `v${data.versionB} over a ${data.windowDays}d window${engineScope(data.engines)}: ` +
    `${mostNotableDelta(data.delta)}${suppressedNote(data.suppressed)}. ` +
    (incidentRatesUnavailable
      ? "Incident rates are not measured per version (no version label on the incident metric) — unknown, not zero. "
      : "") +
    `Confirm with analytics_version_compare; find the driving activity with analytics_element_bottleneck.`
  )
}

export const describeEngineCompare: DescribeForModel<EngineCompareData> = (data) =>
  `Comparing process "${data.processDefinitionKey}" on engine "${data.engineA}" (baseline) vs ` +
  `"${data.engineB}" over ${data.windowDays}d` +
  `${data.activityId ? `, element ${data.activityId}` : ""}: ` +
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

/**
 * The settings section. Its save tool is named only while the section can
 * save (`canSave`: the toolset registers the write AND the caller has an
 * identity to save under) — the model is never told about a write that fails.
 * Rendered in-component (the section self-fetches), hence a spec, not a text.
 */
export function describeAnalyticsSettings(data: AnalyticsSettingsViewData): ModelContextSpec {
  return {
    summary:
      "The operator is viewing the analytics settings: the defaults every analytics call uses when it omits period or minBucketSize.",
    facts: {
      defaultPeriod: data.settings.defaultPeriod,
      minBucketSize: data.settings.minBucketSize,
      editable: data.canSave,
    },
    tools: ["analytics_save_settings"],
    surface: { has: (tool) => tool === "analytics_save_settings" && data.canSave },
  }
}

export const describeBpmnHeatmap: DescribeForModel<AnalyticsBpmnHeatmapData> = (data) => {
  const hottest = maxEntry(data.frequency)
  const slowest = maxEntry(data.durationSec)
  return (
    `Viewing the BPMN heatmap for process "${data.processDefinitionKey}" over ${data.period}` +
    `${engineScope(data.engines)}: ` +
    `heat on ${Object.keys(data.frequency).length} element(s)` +
    `${hottest ? `; hottest "${hottest[0]}" (${hottest[1]} executions)` : ""}` +
    `${slowest ? `, slowest "${slowest[0]}" (avg ${Math.round(slowest[1] * 10) / 10}s)` : ""}. ` +
    `The frequency↔duration toggle is client-side. Quantify a hotspot with ` +
    `analytics_element_bottleneck({ processDefinitionKey: "${data.processDefinitionKey}" }).`
  )
}
