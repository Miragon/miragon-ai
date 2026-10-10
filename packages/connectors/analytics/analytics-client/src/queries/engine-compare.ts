import { escapeLabelValue, selector, type PrometheusClient } from "../prometheus.js"
import {
  belowMinBucket,
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
  processDefinitionKey: string
  windowDays: number
  activityId: string | null
  minBucketSize: number
  suppressed: boolean
  kpis: EngineCompareKpi[]
  delta: EngineCompareDelta
}

/**
 * Side-by-side comparison of ONE process definition as it runs on two engines,
 * over a shared rolling window. The engine is a metric label (`engine_id`) and
 * all engines write to one Prometheus, so the partition is exact with no
 * per-engine DB fan-out.
 *
 * `processDefinitionKey` is required by design. Comparing two engines' entire
 * workloads would compare their PROCESS MIXES: engines host different
 * processes, so an engine running an inherently error-prone process reads
 * "worse" no matter how healthy it is — a textbook confound (the same
 * aggregation can even invert the per-process truth, Simpson's paradox).
 * Holding the process fixed is what makes a delta attributable to the engine.
 * The cross-engine picture without that scope is `engineLandscape`, which
 * reports mix-independent signals instead (absolute load, engine-owned job
 * backlog) and names the keys deployed on several engines — the valid inputs
 * here.
 *
 * `incident_count`/`incident_rate_pct` cover every activity; with `activityId`
 * the `element_incident_*` fields add the count at that element.
 */
export async function engineCompare(
  ch: PrometheusClient,
  params: {
    processDefinitionKey: string
    engineA: string
    engineB: string
    windowDays: number
    activityId?: string
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

  return {
    engineA: params.engineA,
    engineB: params.engineB,
    processDefinitionKey: params.processDefinitionKey,
    windowDays,
    activityId: params.activityId ?? null,
    minBucketSize: minBucket,
    suppressed: belowMinBucket([a, b], minBucket),
    kpis: [a, b],
    delta: compareKpiDelta(a, b, { baseline: windowDays, other: windowDays }),
  }
}

async function engineKpi(
  ch: PrometheusClient,
  params: { processDefinitionKey: string; activityId?: string },
  bucket: "engineA" | "engineB",
  engineId: string,
  range: string,
): Promise<EngineCompareKpi> {
  const engine = `engine_id="${escapeLabelValue(engineId)}"`
  const keyMatcher = `process_definition_key="${escapeLabelValue(params.processDefinitionKey)}"`
  const kpis = await queryCompareKpis(
    ch,
    {
      sel: selector(keyMatcher, engine),
      completedSel: selector(keyMatcher, `state="COMPLETED"`, engine),
      elementIncidentSel: params.activityId
        ? selector(keyMatcher, `activity_id="${escapeLabelValue(params.activityId)}"`, engine)
        : undefined,
    },
    `[${range}]`,
  )
  return { engineId, bucket, ...kpis }
}
