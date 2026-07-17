import type { PrometheusClient, PromSample } from "../prometheus.js"
import { METRIC_NAMES as M } from "../metric-names.js"

/** Round to one decimal place (KPI seconds / percentages). */
export const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Parse an ISO datetime into epoch seconds. Throws a caller-readable error
 * instead of letting a NaN reach PromQL as `[NaNs] @ NaN` (Prometheus would
 * answer with an opaque parse error).
 */
export function parseIsoSeconds(value: string, field: string): number {
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) {
    throw new Error(
      `${field} "${value}" is not a parseable ISO datetime (expected e.g. 2026-07-01T12:00:00Z)`,
    )
  }
  return Math.round(ms / 1000)
}

/**
 * Value of the first sample, or 0 when the query returned no series.
 * (health.ts keeps its own rounding variant on purpose — gauges there are
 * integer counts, while the KPI modules round selectively per field.)
 */
export const first = (s: PromSample[]) => (s.length ? s[0].value : 0)

/**
 * Index sample values by one label, dropping samples that miss the label.
 * The last sample wins on duplicate label values.
 */
export function byLabel(samples: PromSample[], label: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of samples) {
    const k = s.metric[label]
    if (k !== undefined) out[k] = s.value
  }
  return out
}

/**
 * Percentage change from `before` to `after`, rounded to two decimals.
 * Returns null on a zero baseline instead of dividing by zero.
 */
export function pctChange(before: number, after: number): number | null {
  if (before === 0) return null
  return Math.round(((after - before) / before) * 10000) / 100
}

/** Label selectors scoping one KPI partition (a window, an engine, a version …). */
export interface KpiScope {
  /** Base selector: instance starts, incidents and durations. */
  sel: string
  /** Base selector additionally matching `state="COMPLETED"` (completed count). */
  completedSel: string
  /**
   * Selector for the reported `incident_count`, e.g. additionally narrowed to
   * one `activity_id`. Defaults to `sel` (same signal, unscoped).
   */
  incidentSel?: string
}

/**
 * The shared instance-KPI PromQL block used by the dashboard, performance and
 * compare modules: counts via `increase()` over the range window, durations
 * from the histogram (`histogram_quantile` for p50/p95, sum/count for the
 * mean). `rangeExpr` is the full PromQL range suffix, e.g. `[7d]` or
 * `[86400s] @ 1700000000`. Callers pick the strings they need, so each
 * module's query set stays exactly what it was before the extraction.
 */
export function kpiQueries(scope: KpiScope, rangeExpr: string) {
  const { sel, completedSel, incidentSel = sel } = scope
  const r = rangeExpr
  return {
    started: `sum(increase(${M.processInstanceStarted}${sel}${r}))`,
    completed: `sum(increase(${M.processInstanceEnded}${completedSel}${r}))`,
    incidents: `sum(increase(${M.incidentCreated}${sel}${r}))`,
    scopedIncidents: `sum(increase(${M.incidentCreated}${incidentSel}${r}))`,
    avgDuration: `sum(increase(${M.processInstanceDuration}_sum${sel}${r})) / sum(increase(${M.processInstanceDuration}_count${sel}${r}))`,
    medianDuration: `histogram_quantile(0.5, sum by (le)(increase(${M.processInstanceDuration}_bucket${sel}${r})))`,
    p95Duration: `histogram_quantile(0.95, sum by (le)(increase(${M.processInstanceDuration}_bucket${sel}${r})))`,
  }
}

/** The KPI core every compare module reports per partition. */
export interface CompareKpis {
  instance_count: number
  completed_count: number
  failed_count: number
  failure_rate_pct: number
  incident_count: number
  incident_rate_pct: number
  avg_duration_sec: number
  p95_duration_sec: number
}

/**
 * Runs the 6-query KPI block shared by the compare modules (cluster / engine /
 * version) for one partition. `failed_count` / `failure_rate_pct` are
 * incident-based (consistent across the analytics tools); `incident_count` is
 * the same signal under `incidentSel`.
 */
export async function queryCompareKpis(
  ch: PrometheusClient,
  scope: KpiScope,
  rangeExpr: string,
): Promise<CompareKpis> {
  const q = kpiQueries(scope, rangeExpr)
  const [total, completed, failed, incidents, avg, p95] = await Promise.all([
    ch.instant(q.started),
    ch.instant(q.completed),
    ch.instant(q.incidents),
    ch.instant(q.scopedIncidents),
    ch.instant(q.avgDuration),
    ch.instant(q.p95Duration),
  ])
  const instances = Math.round(first(total))
  const failedCount = Math.round(first(failed))
  const incidentCount = Math.round(first(incidents))
  return {
    instance_count: instances,
    completed_count: Math.round(first(completed)),
    failed_count: failedCount,
    failure_rate_pct: instances > 0 ? round1((failedCount * 100) / instances) : 0,
    incident_count: incidentCount,
    incident_rate_pct: instances > 0 ? round1((incidentCount * 100) / instances) : 0,
    avg_duration_sec: round1(first(avg)),
    p95_duration_sec: round1(first(p95)),
  }
}

/** Deltas of `other` vs `baseline`: percentage points for rates, percent otherwise. */
export interface CompareKpiDelta {
  instance_count_delta_pct: number | null
  failure_rate_delta_pp: number | null
  incident_rate_delta_pp: number | null
  avg_duration_delta_pct: number | null
  p95_duration_delta_pct: number | null
}

/** Shared delta block of the compare modules (null instead of a zero-baseline division). */
export function compareKpiDelta(baseline: CompareKpis, other: CompareKpis): CompareKpiDelta {
  return {
    instance_count_delta_pct: pctChange(baseline.instance_count, other.instance_count),
    failure_rate_delta_pp: round1(other.failure_rate_pct - baseline.failure_rate_pct),
    incident_rate_delta_pp: round1(other.incident_rate_pct - baseline.incident_rate_pct),
    avg_duration_delta_pct: pctChange(baseline.avg_duration_sec, other.avg_duration_sec),
    p95_duration_delta_pct: pctChange(baseline.p95_duration_sec, other.p95_duration_sec),
  }
}
