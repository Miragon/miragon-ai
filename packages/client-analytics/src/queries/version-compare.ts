import {
  engineMatcher,
  escapeLabelValue,
  selector,
  type EngineFilterInput,
  type PrometheusClient,
  type PromSample,
} from "../prometheus.js"

export interface VersionCompareKpi {
  version: number
  bucket: "versionA" | "versionB"
  instance_count: number
  completed_count: number
  failed_count: number
  failure_rate_pct: number
  incident_count: number
  incident_rate_pct: number
  avg_duration_sec: number
  p95_duration_sec: number
}

export interface VersionCompareDelta {
  instance_count_delta_pct: number | null
  failure_rate_delta_pp: number | null
  incident_rate_delta_pp: number | null
  avg_duration_delta_pct: number | null
  p95_duration_delta_pct: number | null
}

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
}

const round1 = (n: number) => Math.round(n * 10) / 10
const first = (s: PromSample[]) => (s.length ? s[0].value : 0)

function pctChange(before: number, after: number): number | null {
  if (before === 0) return null
  return Math.round(((after - before) / before) * 10000) / 100
}

/**
 * Side-by-side comparison of two deployed process definition versions, from
 * OTEL metrics. Versions are a metric label (`process_definition_version`), so
 * this is an exact partition over a shared rolling window — no per-instance
 * data needed. `failed_count` is the terminal-failure state count; the failure
 * signal on incident-terminated processes lives in `incident_rate_pct`.
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
    engineId?: EngineFilterInput
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
      failure_rate_delta_pp: round1(b.failure_rate_pct - a.failure_rate_pct),
      incident_rate_delta_pp: round1(b.incident_rate_pct - a.incident_rate_pct),
      avg_duration_delta_pct: pctChange(a.avg_duration_sec, b.avg_duration_sec),
      p95_duration_delta_pct: pctChange(a.p95_duration_sec, b.p95_duration_sec),
    },
  }
}

async function versionKpi(
  ch: PrometheusClient,
  params: { processDefinitionKey: string; elementId?: string; engineId?: EngineFilterInput },
  bucket: "versionA" | "versionB",
  version: number,
  range: string,
): Promise<VersionCompareKpi> {
  const key = escapeLabelValue(params.processDefinitionKey)
  const engine = engineMatcher(params.engineId)
  const verSel = selector(
    `process_definition_key="${key}"`,
    `process_definition_version="${version}"`,
    engine,
  )
  const incidentSel = selector(
    `process_definition_key="${key}"`,
    `process_definition_version="${version}"`,
    params.elementId ? `activity_id="${escapeLabelValue(params.elementId)}"` : undefined,
    engine,
  )

  const [total, completed, failed, incidents, avg, p95] = await Promise.all([
    ch.instant(`sum(increase(camunda_process_instance_started_total${verSel}[${range}]))`),
    ch.instant(
      `sum(increase(camunda_process_instance_ended_total${selector(`process_definition_key="${key}"`, `process_definition_version="${version}"`, `state="COMPLETED"`, engine)}[${range}]))`,
    ),
    ch.instant(
      `sum(increase(camunda_process_instance_ended_total${selector(`process_definition_key="${key}"`, `process_definition_version="${version}"`, `state="INTERNALLY_TERMINATED"`, engine)}[${range}]))`,
    ),
    ch.instant(`sum(increase(camunda_incident_created_total${incidentSel}[${range}]))`),
    ch.instant(
      `sum(increase(camunda_process_instance_duration_seconds_sum${verSel}[${range}])) / sum(increase(camunda_process_instance_duration_seconds_count${verSel}[${range}]))`,
    ),
    ch.instant(
      `histogram_quantile(0.95, sum by (le)(increase(camunda_process_instance_duration_seconds_bucket${verSel}[${range}])))`,
    ),
  ])

  const instances = Math.round(first(total))
  const failedCount = Math.round(first(failed))
  const incidentCount = Math.round(first(incidents))
  return {
    version,
    bucket,
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
