import {
  engineIdsOf,
  engineMatcher,
  escapeLabelValue,
  selector,
  type EngineFilterInput,
  type PrometheusClient,
} from "../prometheus.js"
import {
  belowMinBucket,
  compareKpiDelta,
  parseIsoSeconds,
  queryCompareKpis,
  type CompareKpiDelta,
  type CompareKpis,
} from "./helpers.js"
import {
  DAY_SECONDS,
  clampWindow,
  daysOf,
  isoOf,
  nowSeconds,
  rangeAt,
  type ClampedWindow,
} from "./windows.js"

export interface ClusterCompareKpi extends CompareKpis {
  period: "before" | "after"
  window_from: string
  window_to: string
  /** The window's ACTUAL length in days, after clamping to now and retention. */
  window_days: number
}

export type ClusterCompareDelta = CompareKpiDelta

export interface ClusterCompareResult {
  /** The engine ids covered; `null` = every engine Prometheus holds (unscoped library call). */
  engines: string[] | null
  processDefinitionKey: string | null
  activityId: string | null
  deploymentTimestamp: string
  /** The window lengths asked for, in whole days (the tool inputs). */
  requestedWindowDays: { before: number; after: number }
  /** The ACTUAL window lengths in days — what was measured, not what was asked for. */
  windowDays: { before: number; after: number }
  /**
   * True when a window is shorter than requested: the post-deploy window
   * reaches past now (a recent deployment) or the baseline past retention.
   */
  partial: boolean
  minBucketSize: number
  suppressed: boolean
  kpis: ClusterCompareKpi[]
  delta: ClusterCompareDelta
  /**
   * When the figures were read from Prometheus (ISO timestamp): the "Stand"
   * a view shows. Optional only for payloads recorded before it existed.
   */
  asOf?: string
}

/**
 * Pre/Post deployment comparison from OTEL metrics. Each window is queried with
 * the PromQL `@ <end>` modifier so the before/after split is exact, and both
 * windows are clamped to `[now − retention, now]`: right after a deployment the
 * post-deploy window holds only the elapsed hours, and is reported as exactly
 * that (`window_days`, `partial`) rather than as the requested span. Instance
 * counts are compared PER DAY, so windows of different length compare fairly.
 *
 * `incident_count`/`incident_rate_pct` cover every activity; with `activityId`
 * the `element_incident_*` fields add the count at that element.
 */
export async function clusterCompare(
  ch: PrometheusClient,
  params: {
    processDefinitionKey?: string
    activityId?: string
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
  const deployTs = parseIsoSeconds(params.deploymentTimestamp, "deploymentTimestamp")
  const now = nowSeconds()
  if (deployTs >= now) {
    throw new Error(
      "deploymentTimestamp lies in the future (or is now) — there is no post-deployment window to compare yet",
    )
  }

  const beforeWin = clampWindow(
    "the pre-deployment window",
    deployTs - before * DAY_SECONDS,
    deployTs,
    now,
  )
  const afterWin = clampWindow(
    "the post-deployment window",
    deployTs,
    deployTs + after * DAY_SECONDS,
    now,
  )

  const [b, a] = await Promise.all([
    windowKpi(ch, params, "before", beforeWin),
    windowKpi(ch, params, "after", afterWin),
  ])

  return {
    engines: engineIdsOf(params.engine),
    processDefinitionKey: params.processDefinitionKey ?? null,
    activityId: params.activityId ?? null,
    deploymentTimestamp: params.deploymentTimestamp,
    requestedWindowDays: { before, after },
    windowDays: { before: b.window_days, after: a.window_days },
    partial: beforeWin.partial || afterWin.partial,
    minBucketSize: minBucket,
    suppressed: belowMinBucket([b, a], minBucket),
    kpis: [b, a],
    // The windows were clamped to this `now`: the figures are as of it.
    asOf: new Date(now * 1000).toISOString(),
    // Exact lengths, not the rounded `window_days`: a 2 h window is 0.083 d.
    delta: compareKpiDelta(b, a, {
      baseline: beforeWin.seconds / DAY_SECONDS,
      other: afterWin.seconds / DAY_SECONDS,
    }),
  }
}

async function windowKpi(
  ch: PrometheusClient,
  params: {
    processDefinitionKey?: string
    activityId?: string
    engine?: EngineFilterInput
  },
  period: "before" | "after",
  win: ClampedWindow,
): Promise<ClusterCompareKpi> {
  const engine = engineMatcher(params.engine)
  const keyMatcher = params.processDefinitionKey
    ? `process_definition_key="${escapeLabelValue(params.processDefinitionKey)}"`
    : undefined
  const kpis = await queryCompareKpis(
    ch,
    {
      sel: selector(keyMatcher, engine),
      completedSel: selector(keyMatcher, `state="COMPLETED"`, engine),
      elementIncidentSel: params.activityId
        ? selector(keyMatcher, `activity_id="${escapeLabelValue(params.activityId)}"`, engine)
        : undefined,
    },
    rangeAt(win),
  )
  return {
    period,
    ...kpis,
    window_from: isoOf(win.from),
    window_to: isoOf(win.to),
    window_days: daysOf(win.seconds),
  }
}
