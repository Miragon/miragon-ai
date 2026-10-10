import type {
  AnalyticsDashboardData,
  CompareKpiDelta,
  FailureDashboardData,
} from "@miragon-ai/analytics-client"
import { modelContextText, type ModelContextSpec } from "@miragon-ai/widget-shell/widgets"
import type { DescribeForModel } from "@miragon-ai/widget-shell/ui"
import { ANALYTICS_ONLY_SURFACE, engineIdsOf, isAggregate } from "./hand-off.js"
import type { ClusterCompareData } from "./cluster-compare.js"
import type { VersionCompareData } from "./version-compare.js"
import type { EngineCompareData } from "./engine-compare.js"
import type { EngineLandscapeData } from "./engine-landscape.js"
import type { AnalyticsSettingsViewData } from "./settings-section.js"
import type { AnalyticsBpmnHeatmapData } from "./bpmn-heatmap.js"
import { deltaFacts } from "./comparison-shared.js"
import { versionCompareCaveats } from "../version-compare-caveats.js"

/**
 * Model-context descriptions for every analytics widget, attached centrally via
 * `adaptDataWidget(..., describe)` in `widgets/index.ts`. Each one is built by
 * `modelContextText` (#338, CLAUDE.md invariant 6) — a static summary of the
 * view, the ids the follow-up tools take, the headline numbers as facts, and
 * the natural follow-up tools — never a hand-written template: a value is
 * inlined only when id-shaped, and a tool is only ever named in `tools`.
 *
 * The scope comes from the DATA, never from the cell props (#336): every
 * analytics result echoes what it covers (process key, period, `engines`), so
 * a widget that self-fetched, was saved or composed by render-view describes
 * exactly the numbers on screen — including which engines a fleet aggregate
 * adds up. A figure that was not measured is null and left out, never a 0.
 *
 * A pure description cannot query the camunda7 surface, so these name
 * analytics tools only (`ANALYTICS_ONLY_SURFACE`); the Ask-AI hand-offs (live
 * surface) add the camunda7 ones where the deployment has them.
 */

/** Said whenever a figure adds up several engines (the deliberate fleet aggregate). */
const AGGREGATED = " The figures add up every engine listed (aggregated)."

/** How many definitions an unscoped dashboard covers (none when scoped to one). */
function definitionCount(data: AnalyticsDashboardData) {
  return data.processDefinitionKey ? undefined : data.definitionBreakdown.length
}

/**
 * The execution summary: flows within the period (`…InWindow` — incidents,
 * not failed instances) kept apart from the live gauges (`…Now`), which do
 * not depend on the period (#336).
 */
export const describeExecutionSummary: DescribeForModel<AnalyticsDashboardData> = (data) =>
  modelContextText({
    summary:
      "The operator is viewing the execution summary of the process analytics: flows within the period (incidents, not failed instances) apart from the live state right now, which does not depend on the period." +
      (isAggregate(data.engines) ? AGGREGATED : ""),
    ids: {
      engine: engineIdsOf(data.engines),
      processDefinitionKey: data.processDefinitionKey ?? undefined,
      period: data.period,
    },
    facts: {
      processDefinitions: definitionCount(data),
      startedInWindow: data.totalCount,
      completedInWindow: data.completedCount,
      incidentsCreatedInWindow: data.incidentsCreated,
      incidentsResolvedInWindow: data.incidentsResolved,
      runningNow: data.runningNow,
      openIncidentsNow: data.openIncidentsNow,
    },
    tools: ["analytics_analyze_process_performance", "analytics_find_failed_instances"],
    surface: ANALYTICS_ONLY_SURFACE,
  })

/** The performance KPIs: durations of the instances that ENDED in the period (null when none did). */
export const describeExecutionPerformance: DescribeForModel<AnalyticsDashboardData> = (data) =>
  modelContextText({
    summary:
      "The operator is viewing the performance KPIs of the process analytics: durations of the instances that ended in the period, and incidents per 100 started instances." +
      (data.avgDurationMs === null
        ? " No instance ended in the period, so there are no durations."
        : "") +
      (isAggregate(data.engines) ? AGGREGATED : ""),
    ids: {
      engine: engineIdsOf(data.engines),
      processDefinitionKey: data.processDefinitionKey ?? undefined,
      period: data.period,
    },
    facts: {
      processDefinitions: definitionCount(data),
      avgDurationMs: data.avgDurationMs,
      medianDurationMs: data.medianDurationMs,
      p95DurationMs: data.p95DurationMs,
      incidentRatePct: data.incidentRatePct,
    },
    tools: ["analytics_element_bottleneck"],
    surface: ANALYTICS_ONLY_SURFACE,
  })

export const describeDefinitionBreakdown: DescribeForModel<AnalyticsDashboardData> = (data) => {
  const top = [...data.definitionBreakdown].sort((a, b) => b.totalInstances - a.totalInstances)[0]
  return modelContextText({
    summary:
      "The operator is viewing the per-definition breakdown of the process analytics; " +
      "the dashboard scopes to one process by its processDefinitionKey." +
      (isAggregate(data.engines) ? AGGREGATED : ""),
    ids: {
      engine: engineIdsOf(data.engines),
      processDefinitionKey: data.processDefinitionKey ?? undefined,
      period: data.period,
    },
    facts: {
      processDefinitions: data.definitionBreakdown.length,
      busiestProcessDefinitionKey: top?.processDefinitionKey,
      busiestStartedInWindow: top?.totalInstances,
      busiestIncidentsCreatedInWindow: top?.incidentsCreated,
      busiestRunningNow: top?.runningNow,
    },
    tools: ["analytics_show_dashboard"],
    surface: ANALYTICS_ONLY_SURFACE,
  })
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
 * string: unless id-shaped it is quoted as untrusted data (#338). The view
 * spans every process, so the largest group's key is a fact, never a scope;
 * the group count is the exact one, and a capped list says how much it shows.
 */
export const describeErrorPatterns: DescribeForModel<FailureDashboardData> = (data) => {
  const top = [...data.errorPatterns].sort((a, b) => b.incidentCount - a.incidentCount)[0]
  const listed = data.errorPatterns.length
  return modelContextText({
    summary:
      "The operator is viewing the incidents open right now (point-in-time), grouped by incident type and process; the metric carries no message, activity or timestamps." +
      (isAggregate(data.engines) ? AGGREGATED : ""),
    ids: { engine: engineIdsOf(data.engines) },
    // A value that is not id-shaped moves into the untrusted fence by itself.
    facts: {
      groups: data.uniqueErrorPatterns,
      listedGroups: listed < data.uniqueErrorPatterns ? listed : undefined,
      largestGroupProcessDefinitionKey: top?.processDefinitionKey,
      largestGroupIncidentType: top?.incidentType,
      largestGroupIncidents: top?.incidentCount,
    },
    tools: ["analytics_find_failed_instances"],
    surface: ANALYTICS_ONLY_SURFACE,
  })
}

/**
 * Open incidents by process (point-in-time live gauges): open incidents per
 * 100 running instances and dead jobs — incidents, not failed instances
 * (#336). The regression check goes to the tools that measure incident rates
 * over time — not analytics_version_compare: it cannot split incidents by
 * version, so its incident rates are null (#327).
 */
export const describeFailureRates: DescribeForModel<FailureDashboardData> = (data) => {
  const top = [...data.processBreakdown].sort(
    (a, b) => (b.incidentRatePct ?? -1) - (a.incidentRatePct ?? -1),
  )[0]
  return modelContextText({
    summary:
      "The operator is viewing the incidents open right now by process (point-in-time): open " +
      "incidents per 100 running instances and dead jobs. A regression shows period over " +
      "period or around a deployment." +
      (isAggregate(data.engines) ? AGGREGATED : ""),
    ids: { engine: engineIdsOf(data.engines) },
    facts: {
      processes: data.processBreakdown.length,
      highestRateProcessDefinitionKey: top?.processDefinitionKey,
      highestOpenIncidentsNow: top?.openIncidents,
      highestRunningNow: top?.runningNow,
      highestIncidentRatePct: top?.incidentRatePct,
      highestDeadJobs: top?.deadJobs,
    },
    tools: ["analytics_compare_execution_periods", "analytics_cluster_compare"],
    surface: ANALYTICS_ONLY_SURFACE,
  })
}

/**
 * The deltas on screen plus the single largest one — the number a user asks
 * about first. The candidates are the {@link deltaFacts} keys: a new
 * `CompareKpiDelta` field must be added there.
 */
function comparisonFacts(delta: CompareKpiDelta, suppressed: boolean) {
  const facts = deltaFacts(delta, suppressed)
  const moved = Object.entries(facts).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] !== 0,
  )
  const largest = moved.reduce<[string, number] | null>(
    (max, entry) => (max === null || Math.abs(entry[1]) > Math.abs(max[1]) ? entry : max),
    null,
  )
  return { ...facts, largestDelta: largest?.[0] ?? "none" }
}

const SUPPRESSED = " The sample is below minBucketSize (suppressed): treat the deltas as noise."

/**
 * Before/after a deployment. The ids re-run the comparison as asked (the
 * requested whole-day windows); the windows actually measured — cut short at
 * now or the retention — are facts (#336).
 */
export const describeClusterCompare: DescribeForModel<ClusterCompareData> = (data) =>
  modelContextText({
    summary:
      "The operator is comparing KPIs before vs after a deployment (cluster-wide unless a " +
      "processDefinitionKey scopes it); durations cover only the instances that ended in a window." +
      (data.partial
        ? " A window was cut short at now or the retention (partial): starts compare per day."
        : "") +
      (data.suppressed ? SUPPRESSED : "") +
      (isAggregate(data.engines) ? AGGREGATED : ""),
    ids: {
      engine: engineIdsOf(data.engines),
      deploymentTimestamp: data.deploymentTimestamp,
      windowBeforeDays: data.requestedWindowDays.before,
      windowAfterDays: data.requestedWindowDays.after,
      processDefinitionKey: data.processDefinitionKey,
      activityId: data.activityId,
    },
    facts: {
      measuredBeforeDays: data.windowDays.before,
      measuredAfterDays: data.windowDays.after,
      ...comparisonFacts(data.delta, data.suppressed),
    },
    tools: ["analytics_cluster_compare", "analytics_element_bottleneck"],
    surface: ANALYTICS_ONLY_SURFACE,
  })

/**
 * Version compare: process-wide (the tool takes no element scope, #336). The
 * incident metric has no version label, so its rates come back null — said
 * in so many words, never left to read as zero.
 */
export const describeVersionCompare: DescribeForModel<VersionCompareData> = (data) => {
  const { incidentRatesUnavailable } = versionCompareCaveats(data)
  return modelContextText({
    summary:
      "The operator is comparing two versions of one process (versionA is the baseline); every " +
      "figure covers the whole process." +
      (incidentRatesUnavailable
        ? " Incident rates are not measured per version (no version label on the incident " +
          "metric) — unknown, not zero."
        : "") +
      (data.suppressed ? SUPPRESSED : "") +
      (isAggregate(data.engines) ? AGGREGATED : ""),
    ids: {
      engine: engineIdsOf(data.engines),
      processDefinitionKey: data.processDefinitionKey,
      versionA: data.versionA,
      versionB: data.versionB,
      windowDays: data.windowDays,
    },
    facts: {
      ...comparisonFacts(data.delta, data.suppressed),
      incidentRatesMeasured: incidentRatesUnavailable ? false : undefined,
    },
    tools: ["analytics_version_compare", "analytics_element_bottleneck"],
    surface: ANALYTICS_ONLY_SURFACE,
  })
}

export const describeEngineCompare: DescribeForModel<EngineCompareData> = (data) =>
  modelContextText({
    summary:
      "The operator is comparing one process on two engines (engineA is the baseline). The " +
      "process is held fixed, so a delta is attributable to the engine rather than to a " +
      "different workload." +
      (data.suppressed ? SUPPRESSED : ""),
    ids: {
      processDefinitionKey: data.processDefinitionKey,
      engineA: data.engineA,
      engineB: data.engineB,
      windowDays: data.windowDays,
      activityId: data.activityId,
    },
    facts: comparisonFacts(data.delta, data.suppressed),
    tools: ["analytics_engine_compare", "analytics_engine_health", "analytics_engine_landscape"],
    surface: ANALYTICS_ONLY_SURFACE,
  })

export const describeEngineLandscape: DescribeForModel<EngineLandscapeData> = (data) => {
  const { totals } = data
  const silent = data.engines.filter((e) => !e.reporting).map((e) => e.engineId)
  const busiest = [...data.engines].sort((a, b) => b.runningInstances - a.runningInstances)[0]
  const backlog = [...data.engines].sort((a, b) => b.executableJobs - a.executableJobs)[0]
  const shared = data.sharedProcessKeys.length > 0
  return modelContextText({
    summary:
      "The operator is viewing the cross-engine landscape: absolute counts and the " +
      "process-independent job backlog on purpose — engines run different process mixes, so " +
      "per-engine failure rates or durations would describe the mix, not the engine." +
      (shared
        ? " A KPI comparison is only sound for a definition deployed on several engines " +
          "(sharedProcessKeys), compared by its processDefinitionKey."
        : " No definition runs on more than one engine, so there is no valid engine-vs-engine " +
          "KPI comparison here."),
    facts: {
      engines: totals.engineCount,
      processDefinitions: totals.processKeyCount,
      runningInstances: totals.runningInstances,
      openIncidents: totals.openIncidents,
      enginesReportingNoMetrics: silent.length > 0 ? silent : undefined,
      busiestEngine: busiest?.engineId,
      busiestRunningInstances: busiest?.runningInstances,
      largestBacklogEngine: backlog && backlog.executableJobs > 0 ? backlog.engineId : undefined,
      largestBacklogExecutableJobs:
        backlog && backlog.executableJobs > 0 ? backlog.executableJobs : undefined,
      sharedProcessKeys: shared ? data.sharedProcessKeys : undefined,
    },
    tools: ["analytics_engine_compare", "analytics_engine_health"].filter(
      (tool) => shared || tool !== "analytics_engine_compare",
    ),
    surface: ANALYTICS_ONLY_SURFACE,
  })
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

/** The BPMN heatmap — over the engines its heat adds up (the `engines` echo, #336). */
export const describeBpmnHeatmap: DescribeForModel<AnalyticsBpmnHeatmapData> = (data) => {
  const hottest = maxEntry(data.frequency)
  const slowest = maxEntry(data.durationSec)
  return modelContextText({
    summary:
      "The operator is viewing the BPMN heatmap of one process (the frequency ↔ duration toggle " +
      "is client-side)." +
      (isAggregate(data.engines) ? AGGREGATED : ""),
    ids: {
      engine: engineIdsOf(data.engines),
      processDefinitionKey: data.processDefinitionKey,
      period: data.period,
    },
    facts: {
      elementsWithHeat: Object.keys(data.frequency).length,
      hottestActivityId: hottest?.[0],
      hottestExecutions: hottest?.[1],
      slowestActivityId: slowest?.[0],
      slowestAvgSec: slowest ? Math.round(slowest[1] * 10) / 10 : undefined,
    },
    tools: ["analytics_element_bottleneck"],
    surface: ANALYTICS_ONLY_SURFACE,
  })
}
