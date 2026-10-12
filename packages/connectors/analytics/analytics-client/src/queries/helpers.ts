import type { PrometheusClient, PromSample } from "../prometheus.js"
import { GAUGE_LABELS, METRIC_NAMES as M, type GaugeName } from "../metric-names.js"
import { RETENTION_DAYS } from "../prometheus.js"
import { DAY_SECONDS, nowSeconds, rangeSeconds, type CountWindow } from "./windows.js"

/** Round to one decimal place (KPI seconds / percentages). */
export const round1 = (n: number) => Math.round(n * 10) / 10

/** Milliseconds (the duration histograms' unit) as seconds, one decimal. */
export const secondsOf = (ms: number) => round1(ms / 1000)

/** {@link secondsOf} that passes `null` (not measured) through. */
export const secondsOrNull = (ms: number | null) => (ms === null ? null : secondsOf(ms))

/**
 * How long a series must have been silent before a window for it to count as
 * born inside that window. Long enough that a scrape gap at the window's start
 * does not pass an old series off as new (its whole history would then count).
 */
const BORN_LOOKBACK = "1h"
const BORN_LOOKBACK_SECONDS = 3600

/**
 * What a counter or histogram series recorded inside `w`, per series — the
 * ONE way every query reads a counter (contract rule 2). The plugin creates a
 * series on its first event, and `increase()` never counts a series' first
 * sample: a rare event such as the first incident of a type at an activity
 * would read 0. So a series that existed before the window counts its
 * `increase()`, and a series born inside it counts its whole value.
 * `series` is a metric name plus its selector, e.g. `camunda_x{engine_id="a"}`.
 *
 * The check looks at the hour before the window. Where that hour lies past
 * the retention (the 30-day period), Prometheus has deleted it and every
 * series would pass for new, counting its whole history; there it looks at
 * the window's own first hour instead: a series silent then was born later.
 * Only a window of an hour or less at the retention edge has no hour to look
 * at and reads plain `increase()`, which can miss a series' first sample but
 * never counts what happened before the window.
 */
export function increaseIn(series: string, w: CountWindow): string {
  const at = w.at === undefined ? "" : ` @ ${w.at}`
  const plain = `increase(${series}[${w.range}]${at})`
  const offset = bornCheckOffset(w)
  if (offset === null) return plain
  const silent = `present_over_time(${series}[${BORN_LOOKBACK}]${at} offset ${offset})`
  return (
    `((${plain} and ${silent})` +
    ` or (max_over_time(${series}[${w.range}]${at}) unless ${silent}))`
  )
}

/**
 * How far back from the window's end the born check's hour ends: the window's
 * start (the hour before it), or, where that hour lies past the retention,
 * the end of the window's first hour; `null` when the window has none.
 */
function bornCheckOffset(w: CountWindow, now: number = nowSeconds()): string | null {
  const seconds = rangeSeconds(w.range)
  const start = (w.at ?? now) - seconds
  if (start - BORN_LOOKBACK_SECONDS >= now - RETENTION_DAYS * DAY_SECONDS) return w.range
  return seconds > BORN_LOOKBACK_SECONDS ? `${seconds - BORN_LOOKBACK_SECONDS}s` : null
}

/**
 * An engine-state gauge with one row per engine-wide figure (contract rule 3):
 * every node of a clustered engine reports the same rows, so the nodes are
 * folded with `max` over the gauge's contract labels before anything sums them.
 */
export const engineState = (gauge: GaugeName, sel: string) =>
  `max by (${GAUGE_LABELS[gauge].join(", ")})(${gauge}${sel})`

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
 * plausible 0 s. A per-key gauge without a series is 0 while the engines
 * report and "not reported" only while they do not — decide that with
 * {@link reportingEnginesQuery}, never from the gauge's own series.
 */
export const firstOrNull = (s: PromSample[]) => (s.length ? s[0].value : null)

/**
 * The engine-state presence probe — one series per engine in scope that
 * reports its state gauges. `camunda_jobs_executable` carries `engine_id`
 * only and is registered on every tick, 0 included; the per-key gauges are
 * not: the metrics plugin registers a row only for what exists (no incident
 * open → no `camunda_incidents_open` series at all). So a per-key gauge
 * without a series is a measured 0 while this probe answers, and "not
 * reported" only while it does not. `engineSel` must hold the engine matcher
 * alone — the gauge has no other label to match.
 */
export const reportingEnginesQuery = (engineSel: string) => engineState(M.jobsExecutable, engineSel)

/** The engine ids the {@link reportingEnginesQuery} probe answered for, ascending. */
export const reportingEngineIds = (samples: PromSample[]): string[] =>
  [...new Set(samples.flatMap((s) => (s.metric.engine_id ? [s.metric.engine_id] : [])))].sort()

/** The as-of stamp of a result: now, as an ISO timestamp (the instant queries evaluate at now). */
export const asOfNow = (): string => new Date().toISOString()

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
 * compare modules: counts via {@link increaseIn} over the window, durations
 * from the histogram (`histogram_quantile` for p50/p95, sum/count for the
 * mean), in MILLISECONDS — the histogram's unit; callers convert. Callers pick
 * the strings they need.
 *
 * The duration histogram is recorded when an instance ENDS (any end state), so
 * every duration covers the instances that ended inside the window only —
 * still-running long instances are not in it (survivorship), and an empty
 * window yields no value at all.
 */
export function kpiQueries(scope: KpiScope, w: CountWindow) {
  const { sel, completedSel } = scope
  const duration = M.processInstanceDuration
  return {
    started: `sum(${increaseIn(`${M.processInstanceStarted}${sel}`, w)})`,
    completed: `sum(${increaseIn(`${M.processInstanceEnded}${completedSel}`, w)})`,
    incidents: `sum(${increaseIn(`${M.incidentCreated}${sel}`, w)})`,
    avgDuration: `sum(${increaseIn(`${duration}_sum${sel}`, w)}) / sum(${increaseIn(`${duration}_count${sel}`, w)})`,
    medianDuration: `histogram_quantile(0.5, sum by (le)(${increaseIn(`${duration}_bucket${sel}`, w)}))`,
    p95Duration: `histogram_quantile(0.95, sum by (le)(${increaseIn(`${duration}_bucket${sel}`, w)}))`,
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
  w: CountWindow,
): Promise<CompareKpis> {
  const q = kpiQueries(scope, w)
  const element = scope.elementIncidentSel
  const [total, completed, incidents, avg, p95, elementIncidents] = await Promise.all([
    ch.instant(q.started),
    ch.instant(q.completed),
    ch.instant(q.incidents),
    ch.instant(q.avgDuration),
    ch.instant(q.p95Duration),
    element === undefined
      ? Promise.resolve(null)
      : ch.instant(`sum(${increaseIn(`${M.incidentCreated}${element}`, w)})`),
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
    avg_duration_sec: secondsOrNull(firstOrNull(avg)),
    p95_duration_sec: secondsOrNull(firstOrNull(p95)),
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
