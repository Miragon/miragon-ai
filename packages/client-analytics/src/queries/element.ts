import {
  engineMatcher,
  escapeLabelValue,
  selector,
  type EngineFilterInput,
  type Period,
  type PrometheusClient,
  type PromSample,
} from "../prometheus.js"

export interface ElementBottleneckRow {
  activity_id: string
  activity_name: string | null
  activity_type: string
  execution_count: number
  avg_duration_sec: number
  p95_duration_sec: number
  total_time_sec: number
  avg_wait_sec: number | null
  total_wait_sec: number | null
  incident_count: number
  incident_rate_pct: number
  bottleneck_score_sec: number
}

export interface ElementBottleneckResult {
  activities: ElementBottleneckRow[]
  minBucketSize: number
  suppressedActivities: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

function byLabel(samples: PromSample[], label: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of samples) {
    const k = s.metric[label]
    if (k !== undefined) out[k] = s.value
  }
  return out
}

/**
 * Rank activities by time contribution + incident rate over a rolling window,
 * from OTEL metrics.
 *
 * Reduced fidelity vs the event store: queue/wait time between activities needs
 * per-instance event ordering, which metrics cannot reconstruct — so
 * `avg_wait_sec`/`total_wait_sec` are null and `bottleneck_score_sec` is the
 * execution-time contribution only. `activity_name` is not a metric label.
 */
export async function elementBottleneck(
  ch: PrometheusClient,
  params: {
    processDefinitionKey: string
    period: Period
    minBucketSize: number
    limit: number
    engineId?: EngineFilterInput
  },
): Promise<ElementBottleneckResult> {
  const range = params.period
  const minBucket = Math.max(1, Math.floor(params.minBucketSize))
  const limit = Math.max(1, Math.floor(params.limit))
  const sel = selector(
    `process_definition_key="${escapeLabelValue(params.processDefinitionKey)}"`,
    engineMatcher(params.engineId),
  )

  const [counts, sums, p95, incidents, types] = await Promise.all([
    ch.instant(`sum by (activity_id)(increase(camunda_activity_ended_total${sel}[${range}]))`),
    ch.instant(
      `sum by (activity_id)(increase(camunda_activity_duration_seconds_sum${sel}[${range}]))`,
    ),
    ch.instant(
      `histogram_quantile(0.95, sum by (activity_id, le)(increase(camunda_activity_duration_seconds_bucket${sel}[${range}])))`,
    ),
    ch.instant(`sum by (activity_id)(increase(camunda_incident_created_total${sel}[${range}]))`),
    ch.instant(
      `sum by (activity_id, activity_type)(increase(camunda_activity_ended_total${sel}[${range}]))`,
    ),
  ])

  const sumBy = byLabel(sums, "activity_id")
  const p95By = byLabel(p95, "activity_id")
  const incidentBy = byLabel(incidents, "activity_id")
  const typeBy: Record<string, string> = {}
  for (const t of types) {
    const id = t.metric.activity_id
    if (id !== undefined && typeBy[id] === undefined) typeBy[id] = t.metric.activity_type ?? ""
  }

  const all: ElementBottleneckRow[] = counts.map((c) => {
    const id = c.metric.activity_id ?? ""
    const count = Math.round(c.value)
    const totalSec = sumBy[id] ?? 0
    const incidentCount = Math.round(incidentBy[id] ?? 0)
    return {
      activity_id: id,
      activity_name: null,
      activity_type: typeBy[id] ?? "",
      execution_count: count,
      avg_duration_sec: count > 0 ? round1(totalSec / count) : 0,
      p95_duration_sec: round1(p95By[id] ?? 0),
      total_time_sec: round1(totalSec),
      avg_wait_sec: null,
      total_wait_sec: null,
      incident_count: incidentCount,
      incident_rate_pct: count > 0 ? round1((incidentCount * 100) / count) : 0,
      bottleneck_score_sec: round1(totalSec),
    }
  })

  const kept = all
    .filter((r) => r.execution_count >= minBucket)
    .sort((a, b) => b.bottleneck_score_sec - a.bottleneck_score_sec)
    .slice(0, limit)

  const aboveThreshold = all.filter((r) => r.execution_count >= minBucket).length
  return {
    activities: kept,
    minBucketSize: minBucket,
    suppressedActivities: Math.max(0, all.length - aboveThreshold),
  }
}

export interface ElementHeatResult {
  /** Per-element execution count over the window, keyed by activity id. */
  frequency: Record<string, number>
  /** Per-element average duration in seconds over the window, keyed by activity id. */
  durationSec: Record<string, number>
}

/**
 * Per-element heat values for the BPMN heatmap, from OTEL metrics: traversal
 * frequency (`camunda_activity_ended_total`) and average duration
 * (`camunda_activity_duration_seconds_sum` / count) per `activity_id`, for one
 * process definition. Returns full maps (no top-N / min-bucket filtering — every
 * element gets a value). Node-level only; metrics carry no per-instance path, so
 * sequence-flow/edge heat is not available. Activity metrics have no version
 * label, so this is per `processDefinitionKey`.
 */
export async function elementHeat(
  ch: PrometheusClient,
  params: { processDefinitionKey: string; period: Period; engineId?: EngineFilterInput },
): Promise<ElementHeatResult> {
  const range = params.period
  const sel = selector(
    `process_definition_key="${escapeLabelValue(params.processDefinitionKey)}"`,
    engineMatcher(params.engineId),
  )

  const [counts, sums] = await Promise.all([
    ch.instant(`sum by (activity_id)(increase(camunda_activity_ended_total${sel}[${range}]))`),
    ch.instant(
      `sum by (activity_id)(increase(camunda_activity_duration_seconds_sum${sel}[${range}]))`,
    ),
  ])

  const countBy = byLabel(counts, "activity_id")
  const sumBy = byLabel(sums, "activity_id")

  const frequency: Record<string, number> = {}
  const durationSec: Record<string, number> = {}
  for (const [id, count] of Object.entries(countBy)) {
    const c = Math.round(count)
    if (c <= 0) continue
    frequency[id] = c
    const totalSec = sumBy[id] ?? 0
    durationSec[id] = round1(totalSec / c)
  }
  return { frequency, durationSec }
}
