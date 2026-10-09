import type { PrometheusClient, PromSample } from "../prometheus.js"
import { METRIC_NAMES as M } from "../metric-names.js"

/** Round to one decimal place (KPI seconds / percentages). */
export const round1 = (n: number) => Math.round(n * 10) / 10

/** {@link round1} that passes `null` (not measured) through. */
export const round1OrNull = (n: number | null) => (n === null ? null : round1(n))

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
 * Value of the first sample, or 0 when the query returned no series — for
 * COUNTS (`sum(increase(…))`), where "no series in the window" means nothing
 * happened. Never use it for a duration or a gauge: there a missing series is
 * "not measured", see {@link firstOrNull}.
 */
export const first = (s: PromSample[]) => (s.length ? s[0].value : 0)

/**
 * Value of the first sample, or `null` when the query returned none — for
 * durations and live gauges. A duration over an empty window is NaN
 * (`0 / 0`, `histogram_quantile` over all-zero buckets), which the client
 * drops, so "nothing ended in the window" lands here as `null`, never as a
 * plausible 0 s. A gauge without a series is "not reported", not 0.
 */
export const firstOrNull = (s: PromSample[]) => (s.length ? s[0].value : null)

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
 * `part` per 100 of `base`, one decimal — `null` when `base` is 0 (a rate of
 * nothing is undefined, not 0 %). Incident rates divide incidents by
 * instances; one instance can carry several incidents, so they may exceed 100.
 */
export function ratePct(part: number, base: number): number | null {
  return base > 0 ? round1((part * 100) / base) : null
}

/**
 * Percentage change from `before` to `after`, rounded to two decimals. `null`
 * when either side is not measured or the baseline is 0 — never a −100 % from
 * a missing value or a division by zero.
 */
export function pctChange(before: number | null, after: number | null): number | null {
  if (before === null || after === null || before === 0) return null
  return Math.round(((after - before) / before) * 10000) / 100
}

/** Percentage-point difference of two rates; `null` when either is not measured. */
export function ppDelta(before: number | null, after: number | null): number | null {
  return before === null || after === null ? null : round1(after - before)
}

/** Label selectors scoping one KPI partition (a window, an engine, a version …). */
export interface KpiScope {
  /** Base selector: instance starts, incidents and durations. */
  sel: string
  /** Base selector additionally matching `state="COMPLETED"` (completed count). */
  completedSel: string
  /**
   * Selector for the element-scoped incident count — the base selector
   * narrowed to one `activity_id`. Absent: no element scope, no element query.
   */
  elementIncidentSel?: string
}

/**
 * The shared instance-KPI PromQL block used by the dashboard, performance and
 * compare modules: counts via `increase()` over the range window, durations
 * from the histogram (`histogram_quantile` for p50/p95, sum/count for the
 * mean). `rangeExpr` is the full PromQL range suffix, e.g. `[7d]` or
 * `[86400s] @ 1700000000`. Callers pick the strings they need.
 *
 * The duration histogram is recorded when an instance ENDS (any end state), so
 * every duration covers the instances that ended inside the window only —
 * still-running long instances are not in it (survivorship), and an empty
 * window yields no value at all.
 */
export function kpiQueries(scope: KpiScope, rangeExpr: string) {
  const { sel, completedSel } = scope
  const r = rangeExpr
  return {
    started: `sum(increase(${M.processInstanceStarted}${sel}${r}))`,
    completed: `sum(increase(${M.processInstanceEnded}${completedSel}${r}))`,
    incidents: `sum(increase(${M.incidentCreated}${sel}${r}))`,
    avgDuration: `sum(increase(${M.processInstanceDuration}_sum${sel}${r})) / sum(increase(${M.processInstanceDuration}_count${sel}${r}))`,
    medianDuration: `histogram_quantile(0.5, sum by (le)(increase(${M.processInstanceDuration}_bucket${sel}${r})))`,
    p95Duration: `histogram_quantile(0.95, sum by (le)(increase(${M.processInstanceDuration}_bucket${sel}${r})))`,
  }
}

/** The KPI core every compare module reports per partition. */
export interface CompareKpis {
  /** Process instances STARTED in the window. */
  instance_count: number
  /** Instances that ended with state COMPLETED in the window. */
  completed_count: number
  /** Incidents CREATED in the window (every activity of the scope). */
  incident_count: number
  /**
   * `incident_count` per 100 started instances — `null` when nothing started.
   * Several incidents per instance are possible, so it may exceed 100.
   */
  incident_rate_pct: number | null
  /** Incidents created at the `activityId` element — `null` without one. */
  element_incident_count: number | null
  /** `element_incident_count` per 100 started instances — `null` without an element or starts. */
  element_incident_rate_pct: number | null
  /** Mean duration of the instances that ENDED in the window — `null` when none did. */
  avg_duration_sec: number | null
  /** p95 duration of the instances that ENDED in the window — `null` when none did. */
  p95_duration_sec: number | null
}

/**
 * Runs the KPI block shared by the compare modules (cluster / engine /
 * version) for one partition: five queries, plus the element-scoped incident
 * count when `scope.elementIncidentSel` is set.
 */
export async function queryCompareKpis(
  ch: PrometheusClient,
  scope: KpiScope,
  rangeExpr: string,
): Promise<CompareKpis> {
  const q = kpiQueries(scope, rangeExpr)
  const element = scope.elementIncidentSel
  const [total, completed, incidents, avg, p95, elementIncidents] = await Promise.all([
    ch.instant(q.started),
    ch.instant(q.completed),
    ch.instant(q.incidents),
    ch.instant(q.avgDuration),
    ch.instant(q.p95Duration),
    element === undefined
      ? Promise.resolve(null)
      : ch.instant(`sum(increase(${M.incidentCreated}${element}${rangeExpr}))`),
  ])
  const instances = Math.round(first(total))
  const incidentCount = Math.round(first(incidents))
  const elementCount = elementIncidents === null ? null : Math.round(first(elementIncidents))
  return {
    instance_count: instances,
    completed_count: Math.round(first(completed)),
    incident_count: incidentCount,
    incident_rate_pct: ratePct(incidentCount, instances),
    element_incident_count: elementCount,
    element_incident_rate_pct: elementCount === null ? null : ratePct(elementCount, instances),
    avg_duration_sec: round1OrNull(firstOrNull(avg)),
    p95_duration_sec: round1OrNull(firstOrNull(p95)),
  }
}

/**
 * Deltas of `other` vs `baseline`: percentage points for rates, percent
 * otherwise. Every delta is `null` when either side is not measured or the
 * baseline is 0.
 */
export interface CompareKpiDelta {
  /**
   * Change in instances started PER DAY — equal windows make it the plain
   * count change; windows of different length (a clamped post-deploy window)
   * still compare fairly.
   */
  started_per_day_delta_pct: number | null
  incident_rate_delta_pp: number | null
  element_incident_rate_delta_pp: number | null
  avg_duration_delta_pct: number | null
  p95_duration_delta_pct: number | null
}

type DeltaInput = Pick<
  CompareKpis,
  | "instance_count"
  | "incident_rate_pct"
  | "element_incident_rate_pct"
  | "avg_duration_sec"
  | "p95_duration_sec"
>

/**
 * Shared delta block of the compare modules. `days` are the two windows'
 * actual lengths; the start counts are compared per day.
 */
export function compareKpiDelta(
  baseline: DeltaInput,
  other: DeltaInput,
  days: { baseline: number; other: number },
): CompareKpiDelta {
  const perDay = (count: number, d: number) => (d > 0 ? count / d : null)
  return {
    started_per_day_delta_pct: pctChange(
      perDay(baseline.instance_count, days.baseline),
      perDay(other.instance_count, days.other),
    ),
    incident_rate_delta_pp: ppDelta(baseline.incident_rate_pct, other.incident_rate_pct),
    element_incident_rate_delta_pp: ppDelta(
      baseline.element_incident_rate_pct,
      other.element_incident_rate_pct,
    ),
    avg_duration_delta_pct: pctChange(baseline.avg_duration_sec, other.avg_duration_sec),
    p95_duration_delta_pct: pctChange(baseline.p95_duration_sec, other.p95_duration_sec),
  }
}

/**
 * Whether a comparison is below the trust threshold: a partition with fewer
 * than `minBucketSize` started instances (the rates' base) OR fewer completed
 * ones (the durations' sample) is noise, not a signal.
 */
export function belowMinBucket(
  partitions: ReadonlyArray<Pick<CompareKpis, "instance_count" | "completed_count">>,
  minBucketSize: number,
): boolean {
  return partitions.some(
    (p) => p.instance_count < minBucketSize || p.completed_count < minBucketSize,
  )
}
