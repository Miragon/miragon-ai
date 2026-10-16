import { describe, expect, it } from "vitest"
import type { VersionCompareKpi, VersionCompareResult } from "@miragon/pulse-analytics-client"
import { versionCompareHandOff } from "./version-compare.js"
import { ANALYTICS_ONLY_SURFACE, bindHandOff } from "./hand-off.js"

const versionKpi = (version: number, incidentRatePct: number): VersionCompareKpi => ({
  version,
  bucket: version === 1 ? "versionA" : "versionB",
  instance_count: 100,
  completed_count: 90,
  incident_count: incidentRatePct,
  incident_rate_pct: incidentRatePct,
  element_incident_count: null,
  element_incident_rate_pct: null,
  avg_duration_sec: 10,
  p95_duration_sec: 20,
})

const result: VersionCompareResult = {
  engines: ["prod-a"],
  processDefinitionKey: "order",
  versionA: 1,
  versionB: 2,
  windowDays: 14,
  minBucketSize: 10,
  suppressed: false,
  kpis: [versionKpi(1, 2), versionKpi(2, 2.5)],
  delta: {
    started_per_day_delta_pct: 0,
    incident_rate_delta_pp: 0.5,
    element_incident_rate_delta_pp: null,
    avg_duration_delta_pct: 25,
    p95_duration_delta_pct: 40,
  },
}

const prompt = (data: VersionCompareResult) =>
  bindHandOff("en", ANALYTICS_ONLY_SURFACE).ask(versionCompareHandOff(data))!

describe("versionCompareHandOff", () => {
  it("re-runs the process-wide comparison on the engines on screen — never an element scope", () => {
    const text = prompt(result)

    expect(text).toContain(
      'Ids: engine="prod-a", processDefinitionKey="order", versionA=1, versionB=2, windowDays=14\n',
    )
    // The tool takes no element scope (#336) — the hand-off must not suggest one.
    expect(text).not.toContain("activityId")
  })

  it("carries the measured deltas, the incident rate per version included", () => {
    const text = prompt(result)
    expect(text).toContain("incidentRateDeltaPp=0.5")
    expect(text).toContain("avgDurationDeltaPct=25")
    expect(text).not.toContain("elementIncidentRateDeltaPp")
  })

  it("leaves a null delta out instead of sending it as 0", () => {
    const text = prompt({ ...result, delta: { ...result.delta, p95_duration_delta_pct: null } })
    expect(text).not.toContain("p95DurationDeltaPct")
  })

  it("names the confirming comparison and the element ranking", () => {
    expect(prompt(result)).toContain(
      "Tools: analytics_version_compare, analytics_element_bottleneck",
    )
  })
})
