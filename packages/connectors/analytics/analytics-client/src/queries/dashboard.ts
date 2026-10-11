import {
  engineIdsOf,
  engineMatcher,
  escapeLabelValue,
  selector,
  type EngineFilterInput,
  type Period,
  type PrometheusClient,
  type PromSample,
} from "../prometheus.js"
import { METRIC_NAMES as M } from "../metric-names.js"
import {
  asOfNow,
  byLabel,
  first,
  firstOrNull,
  kpiQueries,
  ratePct,
  reportingEngineIds,
  reportingEnginesQuery,
} from "./helpers.js"
import type {
  ActivityBreakdownItem,
  AnalyticsDashboardData,
  DefinitionBreakdownItem,
  ErrorPatternItem,
  FailureDashboardData,
  ProcessFailureItem,
} from "../widgets.js"

/** Seconds -> integer milliseconds (preserves the sub-100ms precision the dashboard formats). */
const ms = (sec: number) => Math.round(sec * 1000)
const msOrNull = (sec: number | null) => (sec === null ? null : ms(sec))

/**
 * Aggregated dashboard KPIs + activity / definition breakdowns, from the
 * engine's process metrics. Shared by the dashboard pipeline step and the
 * `analytics_show_dashboard` widget tool. Two kinds of figures, never mixed:
 *
 * - FLOWS within the window (`period`): starts, completions, incidents created
 *   and resolved, and the durations of the instances that ended — `increase()`
 *   over the range. Durations are null when nothing ended; `incidentRatePct` is null
 *   when nothing started.
 * - LIVE STATE right now: `runningNow` / `openIncidentsNow` from the state
 *   gauges (`camunda_process_instances_running`, `camunda_incidents_open`) —
 *   the same numbers the failure dashboard, engine health and the landscape
 *   read, independent of the window. A counter difference within the window
 *   is no substitute: it misses every instance started before the window.
 *   The gauges have rows only for what exists, so whether a missing series is
 *   0 or "not reported" (null) is decided by the engine presence probe
 *   ({@link reportingEnginesQuery}): null only while no engine in scope reports.
 *
 * The activity breakdown groups by (process, activity): BPMN ids are only
 * unique within one model, so `StartEvent_1` of two processes are two rows.
 * The result echoes its scope (process key, period, engines).
 */
export async function dashboardData(
  ch: PrometheusClient,
  params: { processDefinitionKey?: string; period: Period; engine?: EngineFilterInput },
): Promise<AnalyticsDashboardData> {
  const asOf = asOfNow()
  const range = params.period
  const engine = engineMatcher(params.engine)
  const keyMatcher = params.processDefinitionKey
    ? `process_definition_key="${escapeLabelValue(params.processDefinitionKey)}"`
    : undefined
  const sel = selector(keyMatcher, engine)
  const completedSel = selector(keyMatcher, `state="COMPLETED"`, engine)
  const r = `[${range}]`
  const q = kpiQueries({ sel, completedSel }, r)

  // By-clauses stay literal: the contract test attributes each one to its series.
  const [
    started,
    completed,
    incCreated,
    incResolved,
    avg,
    median,
    p95,
    runningNow,
    openIncidentsNow,
    actCount,
    actSum,
    actP95,
    defStarted,
    defCompleted,
    defIncidents,
    defDurSum,
    defDurCount,
    defRunning,
    reporting,
  ] = await Promise.all([
    ch.instant(q.started),
    ch.instant(q.completed),
    ch.instant(q.incidents),
    ch.instant(`sum(increase(${M.incidentResolved}${sel}${r}))`),
    ch.instant(q.avgDuration),
    ch.instant(q.medianDuration),
    ch.instant(q.p95Duration),
    ch.instant(`sum(${M.processInstancesRunning}${sel})`),
    ch.instant(`sum(${M.incidentsOpen}${sel})`),
    ch.instant(
      `sum by (process_definition_key, activity_id, activity_type)(increase(${M.activityEnded}${sel}${r}))`,
    ),
    ch.instant(
      `sum by (process_definition_key, activity_id)(increase(${M.activityDuration}_sum${sel}${r}))`,
    ),
    ch.instant(
      `histogram_quantile(0.95, sum by (process_definition_key, activity_id, le)(increase(${M.activityDuration}_bucket${sel}${r})))`,
    ),
    ch.instant(`sum by (process_definition_key)(increase(${M.processInstanceStarted}${sel}${r}))`),
    ch.instant(
      `sum by (process_definition_key)(increase(${M.processInstanceEnded}${completedSel}${r}))`,
    ),
    ch.instant(`sum by (process_definition_key)(increase(${M.incidentCreated}${sel}${r}))`),
    ch.instant(
      `sum by (process_definition_key)(increase(${M.processInstanceDuration}_sum${sel}${r}))`,
    ),
    ch.instant(
      `sum by (process_definition_key)(increase(${M.processInstanceDuration}_count${sel}${r}))`,
    ),
    ch.instant(`sum by (process_definition_key)(${M.processInstancesRunning}${sel})`),
    ch.instant(reportingEnginesQuery(selector(engine))),
  ])

  const totalCount = Math.round(first(started))
  const incidentsCreated = Math.round(first(incCreated))
  const engineReports = reporting.length > 0
  /** A live gauge: its value; else 0 while an engine in scope reports (no row = none); else unknown. */
  const live = (samples: PromSample[]): number | null => {
    const value = firstOrNull(samples)
    if (value !== null) return Math.round(value)
    return engineReports ? 0 : null
  }

  return {
    processDefinitionKey: params.processDefinitionKey ?? null,
    period: params.period,
    engines: engineIdsOf(params.engine),
    reportingEngines: reportingEngineIds(reporting),
    asOf,
    totalCount,
    completedCount: Math.round(first(completed)),
    incidentsCreated,
    incidentsResolved: Math.round(first(incResolved)),
    incidentRatePct: ratePct(incidentsCreated, totalCount),
    avgDurationMs: msOrNull(firstOrNull(avg)),
    medianDurationMs: msOrNull(firstOrNull(median)),
    p95DurationMs: msOrNull(firstOrNull(p95)),
    runningNow: live(runningNow),
    openIncidentsNow: live(openIncidentsNow),
    activityBreakdown: buildActivityBreakdown(actCount, actSum, actP95),
    definitionBreakdown: buildDefinitionBreakdown(
      {
        started: defStarted,
        completed: defCompleted,
        incidents: defIncidents,
        durSum: defDurSum,
        durCount: defDurCount,
        running: defRunning,
      },
      engineReports || defRunning.length > 0,
    ),
  }
}

/** Composite (process, activity) key — activity ids repeat across models. */
const activityKey = (s: PromSample) =>
  `${s.metric.process_definition_key ?? ""}\u0000${s.metric.activity_id ?? ""}`

function byActivityKey(samples: PromSample[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of samples) out.set(activityKey(s), s.value)
  return out
}

function buildActivityBreakdown(
  typedCounts: PromSample[],
  sums: PromSample[],
  p95: PromSample[],
): ActivityBreakdownItem[] {
  // One row per (process, activity); the type is fixed within one model.
  const rows = new Map<string, { key: string; id: string; type: string; count: number }>()
  for (const s of typedCounts) {
    const k = activityKey(s)
    const row = rows.get(k) ?? {
      key: s.metric.process_definition_key ?? "",
      id: s.metric.activity_id ?? "",
      type: s.metric.activity_type ?? "",
      count: 0,
    }
    row.count += s.value
    rows.set(k, row)
  }
  const sumBy = byActivityKey(sums)
  const p95By = byActivityKey(p95)
  return [...rows.entries()]
    .map(([k, row]) => {
      const count = Math.round(row.count)
      const sumSec = sumBy.get(k)
      const totalSec = sumSec ?? 0
      const p95Sec = p95By.get(k)
      return {
        processDefinitionKey: row.key,
        activityId: row.id,
        activityType: row.type,
        executionCount: count,
        avgDurationMs: sumSec !== undefined && count > 0 ? ms(sumSec / count) : null,
        p95DurationMs: p95Sec === undefined ? null : ms(p95Sec),
        totalTimeMs: ms(totalSec),
      }
    })
    .sort((a, b) => b.totalTimeMs - a.totalTimeMs)
    .slice(0, 20)
}

/**
 * `runningReported`: an engine in scope reports its state gauges — a key
 * without a running row then runs nothing (0); otherwise its count is
 * unknown (null), not 0.
 */
function buildDefinitionBreakdown(
  s: {
    started: PromSample[]
    completed: PromSample[]
    incidents: PromSample[]
    durSum: PromSample[]
    durCount: PromSample[]
    running: PromSample[]
  },
  runningReported: boolean,
): DefinitionBreakdownItem[] {
  const startedBy = byLabel(s.started, "process_definition_key")
  const completedBy = byLabel(s.completed, "process_definition_key")
  const incidentsBy = byLabel(s.incidents, "process_definition_key")
  const sumBy = byLabel(s.durSum, "process_definition_key")
  const countBy = byLabel(s.durCount, "process_definition_key")
  const runningBy = byLabel(s.running, "process_definition_key")
  // A definition belongs in the breakdown when it started work in the window
  // OR has work running now — a long-running process must not vanish.
  const keys = new Set([...Object.keys(startedBy), ...Object.keys(runningBy)])
  return [...keys]
    .map((key) => {
      const cnt = countBy[key] ?? 0
      return {
        processDefinitionKey: key,
        totalInstances: Math.round(startedBy[key] ?? 0),
        completed: Math.round(completedBy[key] ?? 0),
        runningNow: runningReported ? Math.round(runningBy[key] ?? 0) : null,
        incidentsCreated: Math.round(incidentsBy[key] ?? 0),
        avgDurationMs: cnt > 0 ? ms((sumBy[key] ?? 0) / cnt) : null,
      }
    })
    .filter((d) => d.totalInstances > 0 || (d.runningNow ?? 0) > 0)
    .sort(
      (a, b) =>
        b.totalInstances - a.totalInstances ||
        (b.runningNow ?? 0) - (a.runningNow ?? 0) ||
        a.processDefinitionKey.localeCompare(b.processDefinitionKey),
    )
}

/**
 * Current failure / incident state, from the live state gauges
 * (`camunda_incidents_open`, `camunda_jobs_failed`, `camunda_process_instances_running`).
 *
 * Point-in-time ("what is failing now"), so it is robust regardless of how the
 * data arrived — unlike a rate window over `incident_created`, which reads zero
 * on backdated/bulk-imported history. Per process: instances running now, dead
 * jobs, open incidents and open incidents per 100 running instances. Groups
 * are (process, incident type) — the gauge carries no message, activity id,
 * timestamps or instance ids, so the rows carry none either.
 */
export async function failureDashboardData(
  ch: PrometheusClient,
  params: { engine?: EngineFilterInput },
): Promise<FailureDashboardData> {
  const asOf = asOfNow()
  const sel = selector(engineMatcher(params.engine))

  const [patterns, runningByKey, incidentsByKey, deadJobsByKey] = await Promise.all([
    ch.instant(`sum by (process_definition_key, incident_type)(${M.incidentsOpen}${sel})`),
    ch.instant(`sum by (process_definition_key)(${M.processInstancesRunning}${sel})`),
    ch.instant(`sum by (process_definition_key)(${M.incidentsOpen}${sel})`),
    ch.instant(`sum by (process_definition_key)(${M.jobsFailed}${sel})`),
  ])

  // Totals are computed over ALL patterns; only the list itself is capped at
  // the top 50 for display.
  const allPatterns: ErrorPatternItem[] = patterns
    .map((s) => ({
      incidentType: s.metric.incident_type ?? "",
      processDefinitionKey: s.metric.process_definition_key ?? "",
      incidentCount: Math.round(s.value),
    }))
    .filter((p) => p.incidentCount > 0)
    .sort((a, b) => b.incidentCount - a.incidentCount)
  const errorPatterns = allPatterns.slice(0, 50)

  const runningBy = byLabel(runningByKey, "process_definition_key")
  const incidentBy = byLabel(incidentsByKey, "process_definition_key")
  const deadBy = byLabel(deadJobsByKey, "process_definition_key")

  const processBreakdown: ProcessFailureItem[] = Object.keys(incidentBy)
    .map((key) => {
      const running = Math.round(runningBy[key] ?? 0)
      const openIncidents = Math.round(incidentBy[key] ?? 0)
      return {
        processDefinitionKey: key,
        runningNow: running,
        deadJobs: Math.round(deadBy[key] ?? 0),
        openIncidents,
        incidentRatePct: ratePct(openIncidents, running),
      }
    })
    .filter((p) => p.openIncidents > 0)
    .sort((a, b) => b.openIncidents - a.openIncidents)

  const totalIncidents = allPatterns.reduce((s, p) => s + p.incidentCount, 0)
  return {
    engines: engineIdsOf(params.engine),
    totalIncidents,
    uniqueErrorPatterns: allPatterns.length,
    mostAffectedProcess:
      processBreakdown.length > 0 ? processBreakdown[0].processDefinitionKey : null,
    errorPatterns,
    processBreakdown,
    asOf,
  }
}
