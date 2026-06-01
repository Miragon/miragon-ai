import {
  engineMatcher,
  escapeLabelValue,
  selector,
  type EngineFilterInput,
  type Period,
  type PrometheusClient,
  type PromSample,
} from "../prometheus.js"
import type {
  ActivityBreakdownItem,
  AnalyticsDashboardData,
  DefinitionBreakdownItem,
  ErrorPatternItem,
  FailureDashboardData,
  ProcessFailureItem,
} from "../widgets.js"

const round1 = (n: number) => Math.round(n * 10) / 10
const first = (s: PromSample[]) => (s.length ? s[0].value : 0)

function byLabel(samples: PromSample[], label: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of samples) {
    const k = s.metric[label]
    if (k !== undefined) out[k] = s.value
  }
  return out
}

/**
 * Aggregated dashboard KPIs + activity / definition breakdowns over a rolling
 * window, from OTEL metrics. Shared by the dashboard pipeline step and the
 * `analytics_show_dashboard` widget tool. `runningCount` is derived
 * (started − ended), `activityName` is unavailable on metrics.
 */
export async function dashboardData(
  ch: PrometheusClient,
  params: { processDefinitionKey?: string; period: Period; engineId?: EngineFilterInput },
): Promise<AnalyticsDashboardData> {
  const range = params.period
  const engine = engineMatcher(params.engineId)
  const keyMatcher = params.processDefinitionKey
    ? `process_definition_key="${escapeLabelValue(params.processDefinitionKey)}"`
    : undefined
  const sel = selector(keyMatcher, engine)
  const r = `[${range}]`

  const [
    started,
    endedAll,
    completed,
    failed,
    incCreated,
    incResolved,
    avg,
    median,
    p95,
    actCount,
    actSum,
    actP95,
    actType,
    defStarted,
    defCompleted,
    defEndedAll,
    defFailed,
    defDurSum,
    defDurCount,
  ] = await Promise.all([
    ch.instant(`sum(increase(camunda_process_instance_started_total${sel}${r}))`),
    ch.instant(`sum(increase(camunda_process_instance_ended_total${sel}${r}))`),
    ch.instant(
      `sum(increase(camunda_process_instance_ended_total${selector(keyMatcher, `state="COMPLETED"`, engine)}${r}))`,
    ),
    ch.instant(
      `sum(increase(camunda_process_instance_ended_total${selector(keyMatcher, `state="INTERNALLY_TERMINATED"`, engine)}${r}))`,
    ),
    ch.instant(`sum(increase(camunda_incident_created_total${sel}${r}))`),
    ch.instant(`sum(increase(camunda_incident_resolved_total${sel}${r}))`),
    ch.instant(
      `sum(increase(camunda_process_instance_duration_seconds_sum${sel}${r})) / sum(increase(camunda_process_instance_duration_seconds_count${sel}${r}))`,
    ),
    ch.instant(
      `histogram_quantile(0.5, sum by (le)(increase(camunda_process_instance_duration_seconds_bucket${sel}${r})))`,
    ),
    ch.instant(
      `histogram_quantile(0.95, sum by (le)(increase(camunda_process_instance_duration_seconds_bucket${sel}${r})))`,
    ),
    ch.instant(`sum by (activity_id)(increase(camunda_activity_ended_total${sel}${r}))`),
    ch.instant(`sum by (activity_id)(increase(camunda_activity_duration_seconds_sum${sel}${r}))`),
    ch.instant(
      `histogram_quantile(0.95, sum by (activity_id, le)(increase(camunda_activity_duration_seconds_bucket${sel}${r})))`,
    ),
    ch.instant(
      `sum by (activity_id, activity_type)(increase(camunda_activity_ended_total${sel}${r}))`,
    ),
    ch.instant(
      `sum by (process_definition_key)(increase(camunda_process_instance_started_total${sel}${r}))`,
    ),
    ch.instant(
      `sum by (process_definition_key)(increase(camunda_process_instance_ended_total${selector(keyMatcher, `state="COMPLETED"`, engine)}${r}))`,
    ),
    ch.instant(
      `sum by (process_definition_key)(increase(camunda_process_instance_ended_total${sel}${r}))`,
    ),
    ch.instant(
      `sum by (process_definition_key)(increase(camunda_process_instance_ended_total${selector(keyMatcher, `state="INTERNALLY_TERMINATED"`, engine)}${r}))`,
    ),
    ch.instant(
      `sum by (process_definition_key)(increase(camunda_process_instance_duration_seconds_sum${sel}${r}))`,
    ),
    ch.instant(
      `sum by (process_definition_key)(increase(camunda_process_instance_duration_seconds_count${sel}${r}))`,
    ),
  ])

  const totalCount = Math.round(first(started))
  const completedCount = Math.round(first(completed))
  const endedCount = Math.round(first(endedAll))
  const openIncidents = Math.max(0, Math.round(first(incCreated) - first(incResolved)))

  const activityBreakdown = buildActivityBreakdown(actCount, actSum, actP95, actType)
  const definitionBreakdown = buildDefinitionBreakdown(
    defStarted,
    defCompleted,
    defEndedAll,
    defFailed,
    defDurSum,
    defDurCount,
  )

  return {
    totalCount,
    completedCount,
    runningCount: Math.max(0, totalCount - endedCount),
    failedCount: Math.round(first(failed)),
    incidentCount: openIncidents,
    failureRatePct: totalCount > 0 ? round1((openIncidents * 100) / totalCount) : 0,
    avgDurationMs: first(avg) > 0 ? round1(first(avg)) * 1000 : null,
    medianDurationMs: first(median) > 0 ? round1(first(median)) * 1000 : null,
    p95DurationMs: first(p95) > 0 ? round1(first(p95)) * 1000 : null,
    activityBreakdown,
    definitionBreakdown,
  }
}

function buildActivityBreakdown(
  counts: PromSample[],
  sums: PromSample[],
  p95: PromSample[],
  types: PromSample[],
): ActivityBreakdownItem[] {
  const sumBy = byLabel(sums, "activity_id")
  const p95By = byLabel(p95, "activity_id")
  const typeBy: Record<string, string> = {}
  for (const t of types) {
    const id = t.metric.activity_id
    if (id !== undefined && typeBy[id] === undefined) typeBy[id] = t.metric.activity_type ?? ""
  }
  return counts
    .map((c) => {
      const id = c.metric.activity_id ?? ""
      const count = Math.round(c.value)
      const totalSec = sumBy[id] ?? 0
      return {
        activityId: id,
        activityName: "",
        activityType: typeBy[id] ?? "",
        executionCount: count,
        avgDurationMs: count > 0 ? round1(totalSec / count) * 1000 : 0,
        p95DurationMs: round1(p95By[id] ?? 0) * 1000,
        totalTimeMs: round1(totalSec) * 1000,
      }
    })
    .sort((a, b) => b.totalTimeMs - a.totalTimeMs)
    .slice(0, 20)
}

function buildDefinitionBreakdown(
  started: PromSample[],
  completed: PromSample[],
  endedAll: PromSample[],
  failed: PromSample[],
  durSum: PromSample[],
  durCount: PromSample[],
): DefinitionBreakdownItem[] {
  const completedBy = byLabel(completed, "process_definition_key")
  const endedBy = byLabel(endedAll, "process_definition_key")
  const failedBy = byLabel(failed, "process_definition_key")
  const sumBy = byLabel(durSum, "process_definition_key")
  const countBy = byLabel(durCount, "process_definition_key")
  return started
    .map((s) => {
      const key = s.metric.process_definition_key ?? ""
      const total = Math.round(s.value)
      const cnt = countBy[key] ?? 0
      return {
        processDefinitionKey: key,
        totalInstances: total,
        completed: Math.round(completedBy[key] ?? 0),
        running: Math.max(0, total - Math.round(endedBy[key] ?? 0)),
        failed: Math.round(failedBy[key] ?? 0),
        avgDurationMs: cnt > 0 ? round1((sumBy[key] ?? 0) / cnt) * 1000 : null,
      }
    })
    .sort((a, b) => b.totalInstances - a.totalInstances)
}

/**
 * Aggregated failure / incident analysis over a rolling window, from incident
 * metrics. Reduced fidelity: patterns are grouped by `incident_type` (no raw
 * messages), with empty sample-instance ids and occurrence timestamps.
 */
export async function failureDashboardData(
  ch: PrometheusClient,
  params: { period: string; engineId?: EngineFilterInput },
): Promise<FailureDashboardData> {
  const range = (["1d", "7d", "30d", "90d"] as const).includes(params.period as Period)
    ? params.period
    : "7d"
  const engine = engineMatcher(params.engineId)
  const sel = selector(engine)
  const r = `[${range}]`

  const [patterns, started, failed, incidentsByKey] = await Promise.all([
    ch.instant(
      `sum by (process_definition_key, activity_id, incident_type)(increase(camunda_incident_created_total${sel}${r}))`,
    ),
    ch.instant(
      `sum by (process_definition_key)(increase(camunda_process_instance_started_total${sel}${r}))`,
    ),
    ch.instant(
      `sum by (process_definition_key)(increase(camunda_process_instance_ended_total${selector(`state="INTERNALLY_TERMINATED"`, engine)}${r}))`,
    ),
    ch.instant(
      `sum by (process_definition_key)(increase(camunda_incident_created_total${sel}${r}))`,
    ),
  ])

  const errorPatterns: ErrorPatternItem[] = patterns
    .map((s) => ({
      incidentMessage: s.metric.incident_type ?? "",
      activityId: s.metric.activity_id ?? "",
      processDefinitionKey: s.metric.process_definition_key ?? "",
      incidentCount: Math.round(s.value),
      firstOccurrence: "",
      lastOccurrence: "",
      sampleInstanceIds: [] as string[],
    }))
    .filter((p) => p.incidentCount > 0)
    .sort((a, b) => b.incidentCount - a.incidentCount)
    .slice(0, 50)

  const startedBy = byLabel(started, "process_definition_key")
  const failedBy = byLabel(failed, "process_definition_key")
  const incidentBy = byLabel(incidentsByKey, "process_definition_key")

  const processBreakdown: ProcessFailureItem[] = Object.keys(incidentBy)
    .map((key) => {
      const total = Math.round(startedBy[key] ?? 0)
      const incidentCount = Math.round(incidentBy[key] ?? 0)
      const failedCount = Math.round(failedBy[key] ?? 0)
      return {
        processDefinitionKey: key,
        totalInstances: total,
        failedCount,
        incidentCount,
        failureRatePct: total > 0 ? round1((incidentCount * 100) / total) : 0,
      }
    })
    .filter((p) => p.incidentCount > 0)
    .sort((a, b) => b.incidentCount - a.incidentCount)

  const totalIncidents = errorPatterns.reduce((s, p) => s + p.incidentCount, 0)
  return {
    totalIncidents,
    uniqueErrorPatterns: errorPatterns.length,
    mostAffectedProcess:
      processBreakdown.length > 0 ? processBreakdown[0].processDefinitionKey : null,
    period: range,
    errorPatterns,
    processBreakdown,
  }
}
