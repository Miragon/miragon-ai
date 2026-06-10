import {
  engineMatcher,
  escapeLabelValue,
  selector,
  type EngineFilterInput,
  type PrometheusClient,
  type PromSample,
} from "../prometheus.js"
import { METRIC_NAMES as M } from "../metric-names.js"

export interface ClusterCompareKpi {
  period: "before" | "after"
  instance_count: number
  completed_count: number
  failed_count: number
  failure_rate_pct: number
  incident_count: number
  incident_rate_pct: number
  avg_duration_sec: number
  p95_duration_sec: number
  window_from: string
  window_to: string
}

export interface ClusterCompareDelta {
  instance_count_delta_pct: number | null
  failure_rate_delta_pp: number | null
  incident_rate_delta_pp: number | null
  avg_duration_delta_pct: number | null
  p95_duration_delta_pct: number | null
}

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

const round1 = (n: number) => Math.round(n * 10) / 10
const first = (s: PromSample[]) => (s.length ? s[0].value : 0)
const DAY = 86400

function pctChange(before: number, after: number): number | null {
  if (before === 0) return null
  return Math.round(((after - before) / before) * 10000) / 100
}

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
    delta: {
      instance_count_delta_pct: pctChange(b.instance_count, a.instance_count),
      failure_rate_delta_pp: round1(a.failure_rate_pct - b.failure_rate_pct),
      incident_rate_delta_pp: round1(a.incident_rate_pct - b.incident_rate_pct),
      avg_duration_delta_pct: pctChange(b.avg_duration_sec, a.avg_duration_sec),
      p95_duration_delta_pct: pctChange(b.p95_duration_sec, a.p95_duration_sec),
    },
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
  const r = `[${windowDays}d] @ ${win.to}`

  const [total, completed, failed, incidents, avg, p95] = await Promise.all([
    ch.instant(`sum(increase(${M.processInstanceStarted}${sel}${r}))`),
    ch.instant(`sum(increase(${M.processInstanceEnded}${completedSel}${r}))`),
    ch.instant(`sum(increase(${M.incidentCreated}${sel}${r}))`),
    ch.instant(`sum(increase(${M.incidentCreated}${incidentSel}${r}))`),
    ch.instant(
      `sum(increase(${M.processInstanceDuration}_sum${sel}${r})) / sum(increase(${M.processInstanceDuration}_count${sel}${r}))`,
    ),
    ch.instant(
      `histogram_quantile(0.95, sum by (le)(increase(${M.processInstanceDuration}_bucket${sel}${r})))`,
    ),
  ])

  const instances = Math.round(first(total))
  const failedCount = Math.round(first(failed))
  const incidentCount = Math.round(first(incidents))
  return {
    period,
    instance_count: instances,
    completed_count: Math.round(first(completed)),
    failed_count: failedCount,
    failure_rate_pct: instances > 0 ? round1((failedCount * 100) / instances) : 0,
    incident_count: incidentCount,
    incident_rate_pct: instances > 0 ? round1((incidentCount * 100) / instances) : 0,
    avg_duration_sec: round1(first(avg)),
    p95_duration_sec: round1(first(p95)),
    window_from: new Date(win.from * 1000).toISOString(),
    window_to: new Date(win.to * 1000).toISOString(),
  }
}
