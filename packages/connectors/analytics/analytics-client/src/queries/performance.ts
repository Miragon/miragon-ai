import {
  engineIdsOf,
  engineMatcher,
  escapeLabelValue,
  selector,
  type EngineFilterInput,
  type Period,
  type PrometheusClient,
} from "../prometheus.js"
import { METRIC_NAMES as M } from "../metric-names.js"
import {
  byLabel,
  first,
  firstOrNull,
  kpiQueries,
  parseIsoSeconds,
  ratePct,
  round1,
  round1OrNull,
} from "./helpers.js"
import { clampWindow, daysOf, isoOf, nowSeconds, rangeAt, type ClampedWindow } from "./windows.js"

export interface PerformanceKPI {
  process_definition_key: string
  /** Instances started in the window. */
  total_instances: number
  /** Instances that ended with state COMPLETED in the window. */
  completed: number
  /** Incidents created in the window — incidents, not failed instances. */
  incident_count: number
  /** `incident_count` per 100 started instances (may exceed 100); null when nothing started. */
  incident_rate_pct: number | null
  /** Durations of the instances that ENDED in the window; null when none did. */
  avg_duration_sec: number | null
  median_duration_sec: number | null
  p95_duration_sec: number | null
}

export interface ActivityBreakdownRow {
  activity_id: string
  /** Not a metric label — resolve names from the BPMN. Always null. */
  activity_name: null
  activity_type: string
  execution_count: number
  avg_duration_sec: number | null
  median_duration_sec: number | null
  p95_duration_sec: number | null
  total_time_sec: number
}

export interface PeriodComparisonKpi {
  period: string
  /** The window actually measured, after clamping to now and retention. */
  window_from: string
  window_to: string
  window_days: number
  /** True when clamping cut the requested window short. */
  partial: boolean
  total_instances: number
  /** `total_instances` per day — the figure to compare across windows of different length. */
  started_per_day: number | null
  completed: number
  incident_count: number
  incident_rate_pct: number | null
  avg_duration_sec: number | null
  median_sec: number | null
  p95_sec: number | null
}

export interface PeriodActivityComparisonRow {
  activity_id: string
  activity_name: null
  period: string
  executions: number
  avg_sec: number | null
  p95_sec: number | null
}

/** Result of {@link analyzePerformance}. */
export interface PerformanceResult {
  /** The engine ids covered; `null` = every engine Prometheus holds (unscoped library call). */
  engines: string[] | null
  kpi: PerformanceKPI | null
  activityBreakdown: ActivityBreakdownRow[]
}

export interface PeriodComparisonResult {
  /** The engine ids covered; `null` = every engine Prometheus holds (unscoped library call). */
  engines: string[] | null
  kpiComparison: PeriodComparisonKpi[]
  activityComparison?: PeriodActivityComparisonRow[]
}

/** `{process_definition_key=..., engine_id=...}` plus any extra matchers. */
function pdkSelector(
  key: string,
  engineId: EngineFilterInput,
  ...extra: Array<string | undefined>
) {
  return selector(
    `process_definition_key="${escapeLabelValue(key)}"`,
    engineMatcher(engineId),
    ...extra,
  )
}

/**
 * Process performance KPIs over a rolling window, from OTEL metrics.
 *
 * Counts come from `increase()` over the period; durations from the histogram
 * (`histogram_quantile` for p50/p95, sum/count for the mean) and cover the
 * instances that ENDED in the window — `null` when none did. `incident_count`
 * counts incidents created (metrics carry no per-instance terminal-failure
 * state). `kpi` is null only when the window saw no start, end or incident.
 */
export async function analyzePerformance(
  ch: PrometheusClient,
  params: {
    processDefinitionKey: string
    period: string
    includeActivityBreakdown: boolean
    engine?: EngineFilterInput
  },
): Promise<PerformanceResult> {
  const range = (params.period as Period) ?? "7d"
  const q = kpiQueries(
    {
      sel: pdkSelector(params.processDefinitionKey, params.engine),
      completedSel: pdkSelector(params.processDefinitionKey, params.engine, 'state="COMPLETED"'),
    },
    `[${range}]`,
  )

  const [total, completed, incidents, avg, median, p95] = await Promise.all([
    ch.instant(q.started),
    ch.instant(q.completed),
    ch.instant(q.incidents),
    ch.instant(q.avgDuration),
    ch.instant(q.medianDuration),
    ch.instant(q.p95Duration),
  ])

  const totalInstances = Math.round(first(total))
  const completedCount = Math.round(first(completed))
  const incidentCount = Math.round(first(incidents))
  const avgSec = firstOrNull(avg)
  const observed = totalInstances > 0 || completedCount > 0 || incidentCount > 0 || avgSec !== null
  const kpi: PerformanceKPI | null = observed
    ? {
        process_definition_key: params.processDefinitionKey,
        total_instances: totalInstances,
        completed: completedCount,
        incident_count: incidentCount,
        incident_rate_pct: ratePct(incidentCount, totalInstances),
        avg_duration_sec: round1OrNull(avgSec),
        median_duration_sec: round1OrNull(firstOrNull(median)),
        p95_duration_sec: round1OrNull(firstOrNull(p95)),
      }
    : null

  let activityBreakdown: ActivityBreakdownRow[] = []
  if (params.includeActivityBreakdown) {
    activityBreakdown = await activityBreakdownRows(
      ch,
      params.processDefinitionKey,
      `[${range}]`,
      params.engine,
    )
  }

  return { engines: engineIdsOf(params.engine), kpi, activityBreakdown }
}

async function activityBreakdownRows(
  ch: PrometheusClient,
  key: string,
  rangeExpr: string,
  engineId: EngineFilterInput,
): Promise<ActivityBreakdownRow[]> {
  const sel = pdkSelector(key, engineId)
  // By-clauses stay literal: the contract test attributes each one to its series.
  const [counts, sums, median, p95] = await Promise.all([
    ch.instant(
      `sum by (activity_id, activity_type)(increase(${M.activityEnded}${sel}${rangeExpr}))`,
    ),
    ch.instant(`sum by (activity_id)(increase(${M.activityDuration}_sum${sel}${rangeExpr}))`),
    ch.instant(
      `histogram_quantile(0.5, sum by (activity_id, le)(increase(${M.activityDuration}_bucket${sel}${rangeExpr})))`,
    ),
    ch.instant(
      `histogram_quantile(0.95, sum by (activity_id, le)(increase(${M.activityDuration}_bucket${sel}${rangeExpr})))`,
    ),
  ])
  const sumBy = byLabel(sums, "activity_id")
  const medianBy = byLabel(median, "activity_id")
  const p95By = byLabel(p95, "activity_id")
  const rows: ActivityBreakdownRow[] = counts.map((c) => {
    const id = c.metric.activity_id ?? ""
    const count = Math.round(c.value)
    const sumSec = sumBy[id]
    const totalSec = sumSec ?? 0
    return {
      activity_id: id,
      activity_name: null,
      activity_type: c.metric.activity_type ?? "",
      execution_count: count,
      avg_duration_sec: sumSec !== undefined && count > 0 ? round1(sumSec / count) : null,
      median_duration_sec: round1OrNull(medianBy[id] ?? null),
      p95_duration_sec: round1OrNull(p95By[id] ?? null),
      total_time_sec: round1(totalSec),
    }
  })
  return rows.sort((a, b) => b.total_time_sec - a.total_time_sec).slice(0, 20)
}

/**
 * Compare two explicit execution windows. Each is read as a real historical
 * window via the PromQL `@ <end>` modifier, clamped to `[now − retention,
 * now]` and reported with its ACTUAL bounds (`window_*`, `partial`). Windows
 * of different length are not comparable by count, so each KPI row also
 * carries `started_per_day`. A reversed window, or one entirely in the future
 * or before retention, is refused.
 */
export async function comparePeriods(
  ch: PrometheusClient,
  params: {
    processDefinitionKey: string
    periodAFrom: string
    periodATo: string
    periodBFrom: string
    periodBTo: string
    includeActivityBreakdown: boolean
    engine?: EngineFilterInput
  },
): Promise<PeriodComparisonResult> {
  const now = nowSeconds()
  const a = explicitWindow("periodA", params.periodAFrom, params.periodATo, now)
  const b = explicitWindow("periodB", params.periodBFrom, params.periodBTo, now)
  const [kpiA, kpiB] = await Promise.all([
    periodKpi(ch, params.processDefinitionKey, "Period A", a, params.engine),
    periodKpi(ch, params.processDefinitionKey, "Period B", b, params.engine),
  ])
  const result: PeriodComparisonResult = {
    engines: engineIdsOf(params.engine),
    kpiComparison: [kpiA, kpiB],
  }

  if (params.includeActivityBreakdown) {
    const [actA, actB] = await Promise.all([
      periodActivities(ch, params.processDefinitionKey, "Period A", a, params.engine),
      periodActivities(ch, params.processDefinitionKey, "Period B", b, params.engine),
    ])
    result.activityComparison = [...actA, ...actB].sort(
      (x, y) => x.activity_id.localeCompare(y.activity_id) || x.period.localeCompare(y.period),
    )
  }
  return result
}

function explicitWindow(
  name: "periodA" | "periodB",
  from: string,
  to: string,
  now: number,
): ClampedWindow {
  return clampWindow(
    name,
    parseIsoSeconds(from, `${name}From`),
    parseIsoSeconds(to, `${name}To`),
    now,
  )
}

async function periodKpi(
  ch: PrometheusClient,
  key: string,
  label: string,
  w: ClampedWindow,
  engineId: EngineFilterInput,
): Promise<PeriodComparisonKpi> {
  const q = kpiQueries(
    {
      sel: pdkSelector(key, engineId),
      completedSel: pdkSelector(key, engineId, 'state="COMPLETED"'),
    },
    rangeAt(w),
  )
  const [total, completed, incidents, avg, median, p95] = await Promise.all([
    ch.instant(q.started),
    ch.instant(q.completed),
    ch.instant(q.incidents),
    ch.instant(q.avgDuration),
    ch.instant(q.medianDuration),
    ch.instant(q.p95Duration),
  ])
  const totalInstances = Math.round(first(total))
  const incidentCount = Math.round(first(incidents))
  const days = daysOf(w.seconds)
  return {
    period: label,
    window_from: isoOf(w.from),
    window_to: isoOf(w.to),
    window_days: days,
    partial: w.partial,
    total_instances: totalInstances,
    started_per_day: days > 0 ? round1(totalInstances / days) : null,
    completed: Math.round(first(completed)),
    incident_count: incidentCount,
    incident_rate_pct: ratePct(incidentCount, totalInstances),
    avg_duration_sec: round1OrNull(firstOrNull(avg)),
    median_sec: round1OrNull(firstOrNull(median)),
    p95_sec: round1OrNull(firstOrNull(p95)),
  }
}

async function periodActivities(
  ch: PrometheusClient,
  key: string,
  label: string,
  w: ClampedWindow,
  engineId: EngineFilterInput,
): Promise<PeriodActivityComparisonRow[]> {
  const sel = pdkSelector(key, engineId)
  const r = rangeAt(w)
  const [counts, sums, p95] = await Promise.all([
    ch.instant(`sum by (activity_id)(increase(${M.activityEnded}${sel}${r}))`),
    ch.instant(`sum by (activity_id)(increase(${M.activityDuration}_sum${sel}${r}))`),
    ch.instant(
      `histogram_quantile(0.95, sum by (activity_id, le)(increase(${M.activityDuration}_bucket${sel}${r})))`,
    ),
  ])
  const sumBy = byLabel(sums, "activity_id")
  const p95By = byLabel(p95, "activity_id")
  return counts.map((c) => {
    const id = c.metric.activity_id ?? ""
    const executions = Math.round(c.value)
    const sumSec = sumBy[id]
    return {
      activity_id: id,
      activity_name: null,
      period: label,
      executions,
      avg_sec: sumSec !== undefined && executions > 0 ? round1(sumSec / executions) : null,
      p95_sec: round1OrNull(p95By[id] ?? null),
    }
  })
}
