import {
  escapeLabelValue,
  selector,
  type PrometheusClient,
  type PromSample,
} from "../prometheus.js"

export interface EngineCompareKpi {
  engineId: string
  bucket: "engineA" | "engineB"
  instance_count: number
  completed_count: number
  failed_count: number
  failure_rate_pct: number
  incident_count: number
  incident_rate_pct: number
  avg_duration_sec: number
  p95_duration_sec: number
}

export interface EngineCompareDelta {
  instance_count_delta_pct: number | null
  failure_rate_delta_pp: number | null
  incident_rate_delta_pp: number | null
  avg_duration_delta_pct: number | null
  p95_duration_delta_pct: number | null
}

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

const round1 = (n: number) => Math.round(n * 10) / 10
const first = (s: PromSample[]) => (s.length ? s[0].value : 0)

function pctChange(before: number, after: number): number | null {
  if (before === 0) return null
  return Math.round(((after - before) / before) * 10000) / 100
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
    delta: {
      instance_count_delta_pct: pctChange(a.instance_count, b.instance_count),
      failure_rate_delta_pp: round1(b.failure_rate_pct - a.failure_rate_pct),
      incident_rate_delta_pp: round1(b.incident_rate_pct - a.incident_rate_pct),
      avg_duration_delta_pct: pctChange(a.avg_duration_sec, b.avg_duration_sec),
      p95_duration_delta_pct: pctChange(a.p95_duration_sec, b.p95_duration_sec),
    },
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

  const [total, completed, failed, incidents, avg, p95] = await Promise.all([
    ch.instant(`sum(increase(camunda_process_instance_started_total${sel}[${range}]))`),
    ch.instant(`sum(increase(camunda_process_instance_ended_total${completedSel}[${range}]))`),
    ch.instant(`sum(increase(camunda_incident_created_total${sel}[${range}]))`),
    ch.instant(`sum(increase(camunda_incident_created_total${incidentSel}[${range}]))`),
    ch.instant(
      `sum(increase(camunda_process_instance_duration_seconds_sum${sel}[${range}])) / sum(increase(camunda_process_instance_duration_seconds_count${sel}[${range}]))`,
    ),
    ch.instant(
      `histogram_quantile(0.95, sum by (le)(increase(camunda_process_instance_duration_seconds_bucket${sel}[${range}])))`,
    ),
  ])

  const instances = Math.round(first(total))
  const failedCount = Math.round(first(failed))
  const incidentCount = Math.round(first(incidents))
  return {
    engineId,
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
