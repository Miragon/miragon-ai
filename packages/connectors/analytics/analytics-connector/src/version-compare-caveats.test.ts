import { describe, expect, it } from "vitest"
import { versionCompareCaveats } from "./version-compare-caveats.js"

describe("versionCompareCaveats", () => {
  it("flags the unmeasured incident rates (#327)", () => {
    expect(
      versionCompareCaveats({ kpis: [{ incident_rate_pct: null }, { incident_rate_pct: null }] }),
    ).toEqual({ incidentRatesUnavailable: true })
  })

  it("treats a single null rate as unmeasured", () => {
    expect(
      versionCompareCaveats({ kpis: [{ incident_rate_pct: 3 }, { incident_rate_pct: null }] }),
    ).toEqual({ incidentRatesUnavailable: true })
  })

  it("drops the caveat once the incident rates are measured (metrics contract v2, #337)", () => {
    expect(
      versionCompareCaveats({ kpis: [{ incident_rate_pct: 2 }, { incident_rate_pct: 3 }] }),
    ).toEqual({ incidentRatesUnavailable: false })
  })
})
