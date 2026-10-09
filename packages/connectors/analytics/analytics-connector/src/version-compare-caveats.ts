import type { VersionCompareKpi, VersionCompareResult } from "@miragon-ai/analytics-client"

export interface VersionCompareCaveats {
  /** The failure/incident rates came back null: unknown, never 0. */
  incidentRatesUnavailable: boolean
  /** The `activityId` the caller passed although it scoped nothing, else null. */
  ignoredActivityId: string | null
}

/**
 * The caveats of one version comparison, derived once for every surface that
 * presents it — the show-tool summary, the widget, its Ask-AI prompt and its
 * model description.
 *
 * The incident metric carries no process-version label, so the version compare
 * returns the failure/incident rates as null (#327). `activityId` only ever
 * scoped those incident KPIs — instances and durations are process-wide by
 * construction — so while they are unavailable it scopes nothing, and showing
 * it as the comparison's scope would pin process-wide deltas on one element.
 */
export function versionCompareCaveats(data: {
  kpis: ReadonlyArray<Pick<VersionCompareKpi, "failure_rate_pct" | "incident_rate_pct">>
  activityId: VersionCompareResult["activityId"]
}): VersionCompareCaveats {
  const incidentRatesUnavailable = data.kpis.some(
    (k) => k.failure_rate_pct === null || k.incident_rate_pct === null,
  )
  return {
    incidentRatesUnavailable,
    ignoredActivityId: incidentRatesUnavailable ? data.activityId : null,
  }
}
