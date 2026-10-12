import {
  engineIdsOf,
  engineMatcher,
  escapeLabelValue,
  selector,
  type EngineFilterInput,
  type PrometheusClient,
} from "../prometheus.js"
import {
  asOfNow,
  belowMinBucket,
  compareKpiDelta,
  queryCompareKpis,
  type CompareKpiDelta,
  type CompareKpis,
} from "./helpers.js"

/** One version's KPIs. */
export interface VersionCompareKpi extends CompareKpis {
  version: number
  bucket: "versionA" | "versionB"
}

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
  /**
   * When the figures were read from Prometheus (ISO timestamp): the "Stand"
   * a view shows. Optional only for payloads recorded before it existed.
   */
  asOf?: string
}

/**
 * Side-by-side comparison of two deployed process definition versions, from
 * the engine metrics. Versions are a metric label (`process_definition_version`)
 * on the process-instance AND the incident series, so instance counts,
 * completions, incidents and durations are an exact partition over a shared
 * rolling window. The comparison is process-wide: there is no element scope.
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
  const asOf = asOfNow()

  const [a, b] = await Promise.all([
    versionKpi(ch, params, "versionA", versionA, range),
    versionKpi(ch, params, "versionB", versionB, range),
  ])

  return {
    asOf,
    engines: engineIdsOf(params.engine),
    processDefinitionKey: params.processDefinitionKey,
    versionA,
    versionB,
    windowDays,
    minBucketSize: minBucket,
    suppressed: belowMinBucket([a, b], minBucket),
    kpis: [a, b],
    delta: compareKpiDelta(a, b, { baseline: windowDays, other: windowDays }),
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
  const kpis = await queryCompareKpis(
    ch,
    {
      sel: selector(key, ver, engine),
      completedSel: selector(key, ver, `state="COMPLETED"`, engine),
    },
    { range },
  )
  return { version, bucket, ...kpis }
}
