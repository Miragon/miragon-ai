import {
  engineMatcher,
  escapeLabelValue,
  selector,
  type EngineFilterInput,
  type Period,
  type PrometheusClient,
  type PromSample,
} from "../prometheus.js"
import { METRIC_NAMES as M } from "../metric-names.js"
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
/** Seconds -> integer milliseconds (preserves the sub-100ms precision the dashboard formats). */
const ms = (sec: number) => Math.round(sec * 1000)

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
 * `analytics_show_dashboard` widget tool. `failedCount`/`failureRatePct` are
 * incident-based (consistent with every other analytics tool, so the numbers
 * reconcile tool-to-tool); `incidentCount` is the currently-open net
 * (created − resolved). `runningCount` is derived (started − ended),
 * `activityName` is unavailable on metrics.
 */
export async function dashboardData(
  ch: PrometheusClient,
  params: { processDefinitionKey?: string; period: Period; engine?: EngineFilterInput },
): Promise<AnalyticsDashboardData> {
  const range = params.period
  const engine = engineMatcher(params.engine)
  const keyMatcher = params.processDefinitionKey
    ? `process_definition_key="${escapeLabelValue(params.processDefinitionKey)}"`
    : undefined
  const sel = selector(keyMatcher, engine)
  const r = `[${range}]`

  const [
    started,
    endedAll,
    completed,
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
    ch.instant(`sum(increase(${M.processInstanceStarted}${sel}${r}))`),
    ch.instant(`sum(increase(${M.processInstanceEnded}${sel}${r}))`),
    ch.instant(
      `sum(increase(${M.processInstanceEnded}${selector(keyMatcher, `state="COMPLETED"`, engine)}${r}))`,
    ),
    ch.instant(`sum(increase(${M.incidentCreated}${sel}${r}))`),
    ch.instant(`sum(increase(${M.incidentResolved}${sel}${r}))`),
    ch.instant(
      `sum(increase(${M.processInstanceDuration}_sum${sel}${r})) / sum(increase(${M.processInstanceDuration}_count${sel}${r}))`,
    ),
    ch.instant(
      `histogram_quantile(0.5, sum by (le)(increase(${M.processInstanceDuration}_bucket${sel}${r})))`,
    ),
    ch.instant(
      `histogram_quantile(0.95, sum by (le)(increase(${M.processInstanceDuration}_bucket${sel}${r})))`,
    ),
    ch.instant(`sum by (activity_id)(increase(${M.activityEnded}${sel}${r}))`),
    ch.instant(`sum by (activity_id)(increase(${M.activityDuration}_sum${sel}${r}))`),
    ch.instant(
      `histogram_quantile(0.95, sum by (activity_id, le)(increase(${M.activityDuration}_bucket${sel}${r})))`,
    ),
    ch.instant(`sum by (activity_id, activity_type)(increase(${M.activityEnded}${sel}${r}))`),
    ch.instant(`sum by (process_definition_key)(increase(${M.processInstanceStarted}${sel}${r}))`),
    ch.instant(
      `sum by (process_definition_key)(increase(${M.processInstanceEnded}${selector(keyMatcher, `state="COMPLETED"`, engine)}${r}))`,
    ),
    ch.instant(`sum by (process_definition_key)(increase(${M.processInstanceEnded}${sel}${r}))`),
    ch.instant(`sum by (process_definition_key)(increase(${M.incidentCreated}${sel}${r}))`),
    ch.instant(
      `sum by (process_definition_key)(increase(${M.processInstanceDuration}_sum${sel}${r}))`,
    ),
    ch.instant(
      `sum by (process_definition_key)(increase(${M.processInstanceDuration}_count${sel}${r}))`,
    ),
  ])

  const totalCount = Math.round(first(started))
  const completedCount = Math.round(first(completed))
  const endedCount = Math.round(first(endedAll))
  // Incident-based failure count, matching the other analytics tools so the
  // numbers reconcile. `openIncidents` is the distinct "still open now" signal.
  const failedCount = Math.round(first(incCreated))
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
    failedCount,
    incidentCount: openIncidents,
    failureRatePct: totalCount > 0 ? round1((failedCount * 100) / totalCount) : 0,
    avgDurationMs: first(avg) > 0 ? ms(first(avg)) : null,
    medianDurationMs: first(median) > 0 ? ms(first(median)) : null,
    p95DurationMs: first(p95) > 0 ? ms(first(p95)) : null,
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
        avgDurationMs: count > 0 ? ms(totalSec / count) : 0,
        p95DurationMs: ms(p95By[id] ?? 0),
        totalTimeMs: ms(totalSec),
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
        avgDurationMs: cnt > 0 ? ms((sumBy[key] ?? 0) / cnt) : null,
      }
    })
    .sort((a, b) => b.totalInstances - a.totalInstances)
}

/**
 * Current failure / incident state, from the live state gauges
 * (`camunda_incidents_open`, `camunda_jobs_failed`, `camunda_process_instances_running`).
 *
 * Point-in-time ("what is failing now"), so it is robust regardless of how the
 * data arrived — unlike a rate window over `incident_created`, which reads zero
 * on backdated/bulk-imported history. `failureRatePct` is open incidents over
 * currently-running instances. Reduced fidelity: patterns are grouped by
 * `incident_type` (no raw messages / activity id / sample ids).
 */
export async function failureDashboardData(
  ch: PrometheusClient,
  params: { engine?: EngineFilterInput },
): Promise<FailureDashboardData> {
  const sel = selector(engineMatcher(params.engine))

  const [patterns, runningByKey, incidentsByKey, deadJobsByKey] = await Promise.all([
    ch.instant(`sum by (process_definition_key, incident_type)(${M.incidentsOpen}${sel})`),
    ch.instant(`sum by (process_definition_key)(${M.processInstancesRunning}${sel})`),
    ch.instant(`sum by (process_definition_key)(${M.incidentsOpen}${sel})`),
    ch.instant(`sum by (process_definition_key)(${M.jobsFailed}${sel})`),
  ])

  const errorPatterns: ErrorPatternItem[] = patterns
    .map((s) => ({
      incidentMessage: s.metric.incident_type ?? "",
      activityId: "",
      processDefinitionKey: s.metric.process_definition_key ?? "",
      incidentCount: Math.round(s.value),
      firstOccurrence: "",
      lastOccurrence: "",
      sampleInstanceIds: [] as string[],
    }))
    .filter((p) => p.incidentCount > 0)
    .sort((a, b) => b.incidentCount - a.incidentCount)
    .slice(0, 50)

  const runningBy = byLabel(runningByKey, "process_definition_key")
  const incidentBy = byLabel(incidentsByKey, "process_definition_key")
  const deadBy = byLabel(deadJobsByKey, "process_definition_key")

  const processBreakdown: ProcessFailureItem[] = Object.keys(incidentBy)
    .map((key) => {
      const running = Math.round(runningBy[key] ?? 0)
      const incidentCount = Math.round(incidentBy[key] ?? 0)
      return {
        processDefinitionKey: key,
        totalInstances: running,
        failedCount: Math.round(deadBy[key] ?? 0),
        incidentCount,
        failureRatePct: running > 0 ? round1((incidentCount * 100) / running) : 0,
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
    errorPatterns,
    processBreakdown,
  }
}
