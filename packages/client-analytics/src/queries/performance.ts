import {
  engineMatcher,
  escapeLabelValue,
  selector,
  type EngineFilterInput,
  type Period,
  type PrometheusClient,
} from "../prometheus.js"
import { METRIC_NAMES as M } from "../metric-names.js"
import { byLabel, first, kpiQueries, round1 } from "./helpers.js"

export interface PerformanceKPI {
  process_definition_key: string
  total_instances: number
  completed: number
  failed: number
  failure_rate_pct: number
  avg_duration_sec: number
  median_duration_sec: number
  p95_duration_sec: number
  earliest: string
  latest: string
}

export interface ActivityBreakdownRow {
  activity_id: string
  activity_name: string | null
  activity_type: string
  execution_count: number
  avg_duration_sec: number
  median_duration_sec: number
  p95_duration_sec: number
  total_time_sec: number
}

export interface PeriodComparisonKpi {
  period: string
  total_instances: number
  completed: number
  failed: number
  failure_rate_pct: number
  avg_duration_sec: number
  median_sec: number
  p95_sec: number
}

export interface PeriodActivityComparisonRow {
  activity_id: string
  activity_name: string | null
  period: string
  executions: number
  avg_sec: number
  p95_sec: number
}

export interface PeriodComparisonResult {
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
 * (`histogram_quantile` for p50/p95, sum/count for the mean). `failed` is
 * incident-based — metrics carry no per-instance terminal-failure state — and
 * `activity_name`/`earliest`/`latest` are not on metrics, so they degrade to
 * null/"" (resolve names from the BPMN; drill into instances via camunda7).
 */
export async function analyzePerformance(
  ch: PrometheusClient,
  params: {
    processDefinitionKey: string
    period: string
    includeActivityBreakdown: boolean
    engine?: EngineFilterInput
  },
): Promise<{ kpi: PerformanceKPI | null; activityBreakdown: ActivityBreakdownRow[] }> {
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
  const failed = Math.round(first(incidents))
  const kpi: PerformanceKPI | null =
    totalInstances > 0
      ? {
          process_definition_key: params.processDefinitionKey,
          total_instances: totalInstances,
          completed: Math.round(first(completed)),
          failed,
          failure_rate_pct: totalInstances > 0 ? round1((failed * 100) / totalInstances) : 0,
          avg_duration_sec: round1(first(avg)),
          median_duration_sec: round1(first(median)),
          p95_duration_sec: round1(first(p95)),
          earliest: "",
          latest: "",
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

  return { kpi, activityBreakdown }
}

async function activityBreakdownRows(
  ch: PrometheusClient,
  key: string,
  rangeExpr: string,
  engineId: EngineFilterInput,
): Promise<ActivityBreakdownRow[]> {
  const sel = pdkSelector(key, engineId)
  const [counts, sums, p95] = await Promise.all([
    ch.instant(
      `sum by (activity_id, activity_type)(increase(${M.activityEnded}${sel}${rangeExpr}))`,
    ),
    ch.instant(`sum by (activity_id)(increase(${M.activityDuration}_sum${sel}${rangeExpr}))`),
    ch.instant(
      `histogram_quantile(0.95, sum by (activity_id, le)(increase(${M.activityDuration}_bucket${sel}${rangeExpr})))`,
    ),
  ])
  const sumBy = byLabel(sums, "activity_id")
  const p95By = byLabel(p95, "activity_id")
  const rows: ActivityBreakdownRow[] = counts.map((c) => {
    const id = c.metric.activity_id ?? ""
    const count = Math.round(c.value)
    const totalSec = sumBy[id] ?? 0
    return {
      activity_id: id,
      activity_name: null,
      activity_type: c.metric.activity_type ?? "",
      execution_count: count,
      avg_duration_sec: count > 0 ? round1(totalSec / count) : 0,
      median_duration_sec: 0,
      p95_duration_sec: round1(p95By[id] ?? 0),
      total_time_sec: round1(totalSec),
    }
  })
  return rows.sort((a, b) => b.total_time_sec - a.total_time_sec).slice(0, 20)
}

/**
 * Compare two execution windows. Uses real historical windows via the PromQL
 * `@ <end>` modifier (each period is `[duration] @ end`), subject to Prometheus
 * retention and data existing at that time.
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
  const a = promWindow(params.periodAFrom, params.periodATo)
  const b = promWindow(params.periodBFrom, params.periodBTo)
  const [kpiA, kpiB] = await Promise.all([
    periodKpi(ch, params.processDefinitionKey, "Period A", a, params.engine),
    periodKpi(ch, params.processDefinitionKey, "Period B", b, params.engine),
  ])
  const result: PeriodComparisonResult = { kpiComparison: [kpiA, kpiB] }

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

interface PromWindow {
  rangeExpr: string
}

function promWindow(from: string, to: string): PromWindow {
  const fromMs = Date.parse(from)
  const toMs = Date.parse(to)
  const durationSec = Math.max(1, Math.round((toMs - fromMs) / 1000))
  const at = Math.round(toMs / 1000)
  return { rangeExpr: `[${durationSec}s] @ ${at}` }
}

async function periodKpi(
  ch: PrometheusClient,
  key: string,
  label: string,
  w: PromWindow,
  engineId: EngineFilterInput,
): Promise<PeriodComparisonKpi> {
  const q = kpiQueries(
    {
      sel: pdkSelector(key, engineId),
      completedSel: pdkSelector(key, engineId, 'state="COMPLETED"'),
    },
    w.rangeExpr,
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
  const failed = Math.round(first(incidents))
  return {
    period: label,
    total_instances: totalInstances,
    completed: Math.round(first(completed)),
    failed,
    failure_rate_pct: totalInstances > 0 ? round1((failed * 100) / totalInstances) : 0,
    avg_duration_sec: round1(first(avg)),
    median_sec: round1(first(median)),
    p95_sec: round1(first(p95)),
  }
}

async function periodActivities(
  ch: PrometheusClient,
  key: string,
  label: string,
  w: PromWindow,
  engineId: EngineFilterInput,
): Promise<PeriodActivityComparisonRow[]> {
  const sel = pdkSelector(key, engineId)
  const r = w.rangeExpr
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
    return {
      activity_id: id,
      activity_name: null,
      period: label,
      executions,
      avg_sec: executions > 0 ? round1((sumBy[id] ?? 0) / executions) : 0,
      p95_sec: round1(p95By[id] ?? 0),
    }
  })
}
