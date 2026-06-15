import {
  engineMatcher,
  escapeLabelValue,
  selector,
  type EngineFilterInput,
  type PrometheusClient,
} from "../prometheus.js"
import {
  compareKpiDelta,
  queryCompareKpis,
  type CompareKpiDelta,
  type CompareKpis,
} from "./helpers.js"

export interface VersionCompareKpi extends CompareKpis {
  version: number
  bucket: "versionA" | "versionB"
}

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
}

/**
 * Side-by-side comparison of two deployed process definition versions, from
 * OTEL metrics. Versions are a metric label (`process_definition_version`), so
 * this is an exact partition over a shared rolling window — no per-instance
 * data needed. `failed_count` / `failure_rate_pct` are incident-based
 * (consistent across the analytics tools); `incident_count` is the same signal
 * optionally scoped to `elementId`.
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
    delta: compareKpiDelta(a, b),
  }
}

async function versionKpi(
  ch: PrometheusClient,
  params: { processDefinitionKey: string; elementId?: string; engine?: EngineFilterInput },
  bucket: "versionA" | "versionB",
  version: number,
  range: string,
): Promise<VersionCompareKpi> {
  const key = escapeLabelValue(params.processDefinitionKey)
  const engine = engineMatcher(params.engine)
  const verSel = selector(
    `process_definition_key="${key}"`,
    `process_definition_version="${version}"`,
    engine,
  )
  const completedSel = selector(
    `process_definition_key="${key}"`,
    `process_definition_version="${version}"`,
    `state="COMPLETED"`,
    engine,
  )
  const incidentSel = selector(
    `process_definition_key="${key}"`,
    `process_definition_version="${version}"`,
    params.elementId ? `activity_id="${escapeLabelValue(params.elementId)}"` : undefined,
    engine,
  )

  const kpis = await queryCompareKpis(ch, { sel: verSel, completedSel, incidentSel }, `[${range}]`)
  return { version, bucket, ...kpis }
}
