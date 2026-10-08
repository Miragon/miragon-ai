import {
  engineMatcher,
  escapeLabelValue,
  selector,
  type EngineFilterInput,
  type PrometheusClient,
} from "../prometheus.js"
import {
  first,
  kpiQueries,
  pctChange,
  round1,
  type CompareKpiDelta,
  type CompareKpis,
} from "./helpers.js"

/** The incident-derived members of {@link CompareKpis}. */
type IncidentKpi = "failed_count" | "failure_rate_pct" | "incident_count" | "incident_rate_pct"

/**
 * One version's KPIs. The incident family is `null`, never 0: the incident
 * counter carries no `process_definition_version` label, so incidents cannot be
 * attributed to a version (see {@link VersionCompareResult.notes}).
 */
export interface VersionCompareKpi extends Omit<CompareKpis, IncidentKpi> {
  version: number
  bucket: "versionA" | "versionB"
  failed_count: number | null
  failure_rate_pct: number | null
  incident_count: number | null
  incident_rate_pct: number | null
}

/** `failure_rate_delta_pp` / `incident_rate_delta_pp` are null with the incident KPIs. */
export type VersionCompareDelta = CompareKpiDelta

export interface VersionCompareResult {
  processDefinitionKey: string
  versionA: number
  versionB: number
  windowDays: number
  elementId: string | null
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
  "failed_count, failure_rate_pct, incident_count, incident_rate_pct and their deltas are null " +
  "(not measured, NOT zero): the incident metric carries no process_definition_version label, " +
  "so incidents cannot be attributed to a version. Incident figures exist per process " +
  "definition key only."

/** Added when the caller passed `elementId`: it only ever scoped the incident count. */
export const VERSION_ELEMENT_SCOPE_NOTE =
  "elementId has no effect: it only scopes the incident KPIs, which are unavailable per version."

/**
 * Side-by-side comparison of two deployed process definition versions, from
 * OTEL metrics. Versions are a metric label (`process_definition_version`) on
 * the process-instance series, so instance counts, completions and durations
 * are an exact partition over a shared rolling window.
 *
 * The incident KPIs are NOT: the incident counter has no version label, and
 * filtering it on one matched nothing, which used to read as a trustworthy
 * "0 % failure rate". They are reported as null plus a note instead.
 */
export async function versionCompare(
  ch: PrometheusClient,
  params: {
    processDefinitionKey: string
    versionA: number
    versionB: number
    windowDays: number
    elementId?: string
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

  const suppressed = a.instance_count < minBucket || b.instance_count < minBucket
  return {
    processDefinitionKey: params.processDefinitionKey,
    versionA,
    versionB,
    windowDays,
    elementId: params.elementId ?? null,
    minBucketSize: minBucket,
    suppressed,
    kpis: [a, b],
    delta: {
      instance_count_delta_pct: pctChange(a.instance_count, b.instance_count),
      failure_rate_delta_pp: null,
      incident_rate_delta_pp: null,
      avg_duration_delta_pct: pctChange(a.avg_duration_sec, b.avg_duration_sec),
      p95_duration_delta_pct: pctChange(a.p95_duration_sec, b.p95_duration_sec),
    },
    notes: params.elementId
      ? [VERSION_INCIDENT_KPIS_NOTE, VERSION_ELEMENT_SCOPE_NOTE]
      : [VERSION_INCIDENT_KPIS_NOTE],
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
    failed_count: null,
    failure_rate_pct: null,
    incident_count: null,
    incident_rate_pct: null,
    avg_duration_sec: round1(first(avg)),
    p95_duration_sec: round1(first(p95)),
  }
}
