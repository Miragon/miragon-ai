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

export interface ClusterCompareKpi extends CompareKpis {
  period: "before" | "after"
  window_from: string
  window_to: string
}

export type ClusterCompareDelta = CompareKpiDelta

export interface ClusterCompareResult {
  processDefinitionKey: string | null
  elementId: string | null
  deploymentTimestamp: string
  windowDays: { before: number; after: number }
  minBucketSize: number
  suppressed: boolean
  kpis: ClusterCompareKpi[]
  delta: ClusterCompareDelta
}

const DAY = 86400

/**
 * Pre/Post deployment comparison from OTEL metrics. Each window is queried with
 * the PromQL `@ <end>` modifier so the before/after split is exact (subject to
 * Prometheus retention covering the deployment timestamp). `failed_count` /
 * `failure_rate_pct` are incident-based (consistent across the analytics tools);
 * `incident_count` is the same signal optionally scoped to `elementId`.
 */
export async function clusterCompare(
  ch: PrometheusClient,
  params: {
    processDefinitionKey?: string
    elementId?: string
    deploymentTimestamp: string
    windowBeforeDays: number
    windowAfterDays: number
    minBucketSize: number
    engine?: EngineFilterInput
  },
): Promise<ClusterCompareResult> {
  const minBucket = Math.max(1, Math.floor(params.minBucketSize))
  const before = Math.max(1, Math.floor(params.windowBeforeDays))
  const after = Math.max(1, Math.floor(params.windowAfterDays))
  const deployTs = Math.round(Date.parse(params.deploymentTimestamp) / 1000)

  const beforeWin = { from: deployTs - before * DAY, to: deployTs }
  const afterWin = { from: deployTs, to: deployTs + after * DAY }

  const [b, a] = await Promise.all([
    windowKpi(ch, params, "before", before, beforeWin),
    windowKpi(ch, params, "after", after, afterWin),
  ])

  const suppressed = b.instance_count < minBucket || a.instance_count < minBucket
  return {
    processDefinitionKey: params.processDefinitionKey ?? null,
    elementId: params.elementId ?? null,
    deploymentTimestamp: params.deploymentTimestamp,
    windowDays: { before, after },
    minBucketSize: minBucket,
    suppressed,
    kpis: [b, a],
    delta: compareKpiDelta(b, a),
  }
}

async function windowKpi(
  ch: PrometheusClient,
  params: {
    processDefinitionKey?: string
    elementId?: string
    engine?: EngineFilterInput
  },
  period: "before" | "after",
  windowDays: number,
  win: { from: number; to: number },
): Promise<ClusterCompareKpi> {
  const engine = engineMatcher(params.engine)
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

  const kpis = await queryCompareKpis(
    ch,
    { sel, completedSel, incidentSel },
    `[${windowDays}d] @ ${win.to}`,
  )
  return {
    period,
    ...kpis,
    window_from: new Date(win.from * 1000).toISOString(),
    window_to: new Date(win.to * 1000).toISOString(),
  }
}
