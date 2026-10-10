import {
  engineIdsOf,
  engineMatcher,
  escapeLabelValue,
  selector,
  type EngineFilterInput,
  type PrometheusClient,
} from "../prometheus.js"
import {
  belowMinBucket,
  compareKpiDelta,
  first,
  firstOrNull,
  kpiQueries,
  round1OrNull,
  type CompareKpiDelta,
  type CompareKpis,
} from "./helpers.js"

/** The incident-derived members of {@link CompareKpis}. */
type IncidentKpi =
  "incident_count" | "incident_rate_pct" | "element_incident_count" | "element_incident_rate_pct"

/**
 * One version's KPIs. The incident family is `null`, never 0: the incident
 * counter carries no `process_definition_version` label, so incidents cannot be
 * attributed to a version (see {@link VersionCompareResult.notes}).
 */
export interface VersionCompareKpi extends Omit<CompareKpis, IncidentKpi> {
  version: number
  bucket: "versionA" | "versionB"
  incident_count: null
  incident_rate_pct: null
  element_incident_count: null
  element_incident_rate_pct: null
}

/** The incident-rate deltas are always null with the incident KPIs. */
export type VersionCompareDelta = CompareKpiDelta

export interface VersionCompareResult {
  /** The engine ids covered; `null` = every engine Prometheus holds (unscoped library call). */
  engines: string[] | null
  processDefinitionKey: string
  versionA: number
  versionB: number
  windowDays: number
  minBucketSize: number
  suppressed: boolean
  kpis: VersionCompareKpi[]
  delta: VersionCompareDelta
  /** Why KPIs are null — the caveats the numbers cannot carry themselves. */
  notes: string[]
}

/**
 * Model-facing explanation next to the null incident KPIs. The label is
 * tracked for the metrics contract v2 (#337); once the incident counter
 * carries it, the incident KPIs return and this note goes.
 */
export const VERSION_INCIDENT_KPIS_NOTE =
  "incident_count, incident_rate_pct and the incident-rate deltas are null " +
  "(not measured, NOT zero): the incident metric carries no process_definition_version label, " +
  "so incidents cannot be attributed to a version. Incident figures exist per process " +
  "definition key only."

/**
 * Side-by-side comparison of two deployed process definition versions, from
 * OTEL metrics. Versions are a metric label (`process_definition_version`) on
 * the process-instance series, so instance counts, completions and durations
 * are an exact partition over a shared rolling window.
 *
 * The incident KPIs are NOT: the incident counter has no version label, and
 * filtering it on one matched nothing, which used to read as a trustworthy
 * "0 % failure rate". They are reported as null plus a note instead — and
 * there is no element scope, since an element only ever narrowed incidents.
 */
export async function versionCompare(
  ch: PrometheusClient,
  params: {
    processDefinitionKey: string
    versionA: number
    versionB: number
    windowDays: number
    minBucketSize: number
    engine?: EngineFilterInput
  },
): Promise<VersionCompareResult> {
  const minBucket = Math.max(1, Math.floor(params.minBucketSize))
  const windowDays = Math.max(1, Math.floor(params.windowDays))
  const versionA = Math.max(1, Math.floor(params.versionA))
  const versionB = Math.max(1, Math.floor(params.versionB))
  const range = `${windowDays}d`

  const [a, b] = await Promise.all([
    versionKpi(ch, params, "versionA", versionA, range),
    versionKpi(ch, params, "versionB", versionB, range),
  ])

  return {
    engines: engineIdsOf(params.engine),
    processDefinitionKey: params.processDefinitionKey,
    versionA,
    versionB,
    windowDays,
    minBucketSize: minBucket,
    suppressed: belowMinBucket([a, b], minBucket),
    kpis: [a, b],
    delta: compareKpiDelta(a, b, { baseline: windowDays, other: windowDays }),
    notes: [VERSION_INCIDENT_KPIS_NOTE],
  }
}

async function versionKpi(
  ch: PrometheusClient,
  params: { processDefinitionKey: string; engine?: EngineFilterInput },
  bucket: "versionA" | "versionB",
  version: number,
  range: string,
): Promise<VersionCompareKpi> {
  const engine = engineMatcher(params.engine)
  const key = `process_definition_key="${escapeLabelValue(params.processDefinitionKey)}"`
  const ver = `process_definition_version="${version}"`
  const q = kpiQueries(
    {
      sel: selector(key, ver, engine),
      completedSel: selector(key, ver, `state="COMPLETED"`, engine),
    },
    `[${range}]`,
  )

  // Process-instance series only — they carry the version label.
  const [total, completed, avg, p95] = await Promise.all([
    ch.instant(q.started),
    ch.instant(q.completed),
    ch.instant(q.avgDuration),
    ch.instant(q.p95Duration),
  ])
  return {
    version,
    bucket,
    instance_count: Math.round(first(total)),
    completed_count: Math.round(first(completed)),
    incident_count: null,
    incident_rate_pct: null,
    element_incident_count: null,
    element_incident_rate_pct: null,
    avg_duration_sec: round1OrNull(firstOrNull(avg)),
    p95_duration_sec: round1OrNull(firstOrNull(p95)),
  }
}
