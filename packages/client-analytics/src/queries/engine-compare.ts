import { escapeLabelValue, selector, type PrometheusClient } from "../prometheus.js"
import {
  compareKpiDelta,
  queryCompareKpis,
  type CompareKpiDelta,
  type CompareKpis,
} from "./helpers.js"

export interface EngineCompareKpi extends CompareKpis {
  engineId: string
  bucket: "engineA" | "engineB"
}

export type EngineCompareDelta = CompareKpiDelta

export interface EngineCompareResult {
  engineA: string
  engineB: string
  processDefinitionKey: string | null
  windowDays: number
  elementId: string | null
  minBucketSize: number
  suppressed: boolean
  kpis: EngineCompareKpi[]
  delta: EngineCompareDelta
}

/**
 * Side-by-side comparison of two CIB Seven engines over a shared rolling window,
 * from OTEL metrics. The engine is a metric label (`engine_id`) and all engines
 * write to one Prometheus, so this is an exact partition with no per-engine DB
 * fan-out — the fleet/cluster comparison the metric path is built for. Optionally
 * scope to one `processDefinitionKey`. `failed_count` / `failure_rate_pct` are
 * incident-based (consistent across the analytics tools); `incident_count` is the
 * same signal optionally scoped to `elementId`.
 */
export async function engineCompare(
  ch: PrometheusClient,
  params: {
    engineA: string
    engineB: string
    windowDays: number
    processDefinitionKey?: string
    elementId?: string
    minBucketSize: number
  },
): Promise<EngineCompareResult> {
  const minBucket = Math.max(1, Math.floor(params.minBucketSize))
  const windowDays = Math.max(1, Math.floor(params.windowDays))
  const range = `${windowDays}d`

  const [a, b] = await Promise.all([
    engineKpi(ch, params, "engineA", params.engineA, range),
    engineKpi(ch, params, "engineB", params.engineB, range),
  ])

  const suppressed = a.instance_count < minBucket || b.instance_count < minBucket
  return {
    engineA: params.engineA,
    engineB: params.engineB,
    processDefinitionKey: params.processDefinitionKey ?? null,
    windowDays,
    elementId: params.elementId ?? null,
    minBucketSize: minBucket,
    suppressed,
    kpis: [a, b],
    delta: compareKpiDelta(a, b),
  }
}

async function engineKpi(
  ch: PrometheusClient,
  params: { processDefinitionKey?: string; elementId?: string },
  bucket: "engineA" | "engineB",
  engineId: string,
  range: string,
): Promise<EngineCompareKpi> {
  const engine = `engine_id="${escapeLabelValue(engineId)}"`
  const keyMatcher = params.processDefinitionKey
    ? `process_definition_key="${escapeLabelValue(params.processDefinitionKey)}"`
    : undefined
  const sel = selector(keyMatcher, engine)
  const completedSel = selector(keyMatcher, `state="COMPLETED"`, engine)
  const incidentSel = selector(
    keyMatcher,
    params.elementId ? `activity_id="${escapeLabelValue(params.elementId)}"` : undefined,
    engine,
  )

  const kpis = await queryCompareKpis(ch, { sel, completedSel, incidentSel }, `[${range}]`)
  return { engineId, bucket, ...kpis }
}
