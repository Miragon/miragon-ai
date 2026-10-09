import { describe, expect, it } from "vitest"
import type { VersionCompareKpi } from "@miragon-ai/analytics-client"
import { versionCompareCaveats } from "./version-compare-caveats.js"

const kpi = (rates: Pick<VersionCompareKpi, "failure_rate_pct" | "incident_rate_pct">) => rates

const unmeasured = kpi({ failure_rate_pct: null, incident_rate_pct: null })
const measured = kpi({ failure_rate_pct: 2, incident_rate_pct: 3 })

describe("versionCompareCaveats", () => {
  it("flags the unmeasured incident rates and the element they would have scoped (#327)", () => {
    expect(
      versionCompareCaveats({ kpis: [unmeasured, unmeasured], activityId: "Task_check" }),
    ).toEqual({ incidentRatesUnavailable: true, ignoredActivityId: "Task_check" })
  })

  it("flags the unmeasured rates when no element was passed", () => {
    expect(versionCompareCaveats({ kpis: [unmeasured, unmeasured], activityId: null })).toEqual({
      incidentRatesUnavailable: true,
      ignoredActivityId: null,
    })
  })

  it.each([
    ["failure", { failure_rate_pct: null, incident_rate_pct: 3 }],
    ["incident", { failure_rate_pct: 2, incident_rate_pct: null }],
  ])("treats a single null %s rate as unmeasured", (_rate, partial) => {
    const caveats = versionCompareCaveats({ kpis: [measured, kpi(partial)], activityId: "T" })
    expect(caveats).toEqual({ incidentRatesUnavailable: true, ignoredActivityId: "T" })
  })

  it("keeps the element once the incident rates are measured — it scopes them again", () => {
    expect(versionCompareCaveats({ kpis: [measured, measured], activityId: "Task_check" })).toEqual(
      {
        incidentRatesUnavailable: false,
        ignoredActivityId: null,
      },
    )
  })
})
