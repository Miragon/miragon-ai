import type { VersionCompareKpi } from "@miragon-ai/analytics-client"

export interface VersionCompareCaveats {
  /** The incident rates came back null: unknown, never 0. */
  incidentRatesUnavailable: boolean
}

/**
 * The caveats of one version comparison, derived once for every surface that
 * presents it — the show-tool summary, the widget, its Ask-AI prompt and its
 * model description.
 *
 * The incident metric carries no process-version label, so the version compare
 * returns the incident rates as null (#327) until the metrics contract v2
 * (#337) adds the label.
 */
export function versionCompareCaveats(data: {
  kpis: ReadonlyArray<{ incident_rate_pct: VersionCompareKpi["incident_rate_pct"] | number }>
}): VersionCompareCaveats {
  return { incidentRatesUnavailable: data.kpis.some((k) => k.incident_rate_pct === null) }
}
