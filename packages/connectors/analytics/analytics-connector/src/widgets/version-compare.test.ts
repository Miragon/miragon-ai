import { describe, expect, it } from "vitest"
import type { VersionCompareKpi, VersionCompareResult } from "@miragon-ai/analytics-client"
import { translator } from "../messages/index.js"
import type { T } from "../messages/use-t.js"
import { versionCompareCaveats } from "../version-compare-caveats.js"
import { versionCompareHandOff, versionCompareNote } from "./version-compare.js"
import { ANALYTICS_ONLY_SURFACE, bindHandOff } from "./hand-off.js"

const t: T = (key, params) => translator("en", key, params)

const versionKpi = (version: number): VersionCompareKpi => ({
  version,
  bucket: version === 1 ? "versionA" : "versionB",
  instance_count: 100,
  completed_count: 90,
  incident_count: null,
  incident_rate_pct: null,
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
  kpis: [versionKpi(1), versionKpi(2)],
  delta: {
    started_per_day_delta_pct: 0,
    incident_rate_delta_pp: null,
    element_incident_rate_delta_pp: null,
    avg_duration_delta_pct: 25,
    p95_duration_delta_pct: 40,
  },
  notes: [],
}

const prompt = (data: VersionCompareResult) =>
  bindHandOff("en", ANALYTICS_ONLY_SURFACE).ask(
    versionCompareHandOff(data, versionCompareCaveats(data)),
  )!

describe("versionCompareNote", () => {
  it("explains the n/a incident rates", () => {
    expect(versionCompareNote(t, versionCompareCaveats(result))).toBe(
      t("aVersionCompare.incidentKpisUnavailable"),
    )
  })

  it("shows no note once the incident rates are measured", () => {
    expect(versionCompareNote(t, { incidentRatesUnavailable: false })).toBeUndefined()
  })
})

describe("versionCompareHandOff", () => {
  it("re-runs the process-wide comparison on the engines on screen — never an element scope", () => {
    const text = prompt(result)

    expect(text).toContain(
      'Ids: engine="prod-a", processDefinitionKey="order", versionA=1, versionB=2, windowDays=14\n',
    )
    // The tool takes no element scope (#336) — the hand-off must not suggest one.
    expect(text).not.toContain("activityId")
  })

  it("carries the caveat and leaves null deltas out instead of sending them as 0 (#327)", () => {
    const text = prompt(result)
    expect(text).toContain(
      "On screen: startedPerDayDeltaPct=0, avgDurationDeltaPct=25, p95DurationDeltaPct=40, suppressed=false, incidentRatesMeasured=false",
    )
    expect(text).not.toContain("incidentRateDeltaPp")
    expect(text).not.toContain("failureRate")
  })

  it("drops the caveat once the incident rates are measured", () => {
    // Version KPIs once the incident metric carries a version label (#337).
    const measured = {
      ...result,
      kpis: result.kpis.map((k) => ({ ...k, incident_count: 2, incident_rate_pct: 2 })),
      delta: { ...result.delta, incident_rate_delta_pp: 0.5 },
    } as unknown as VersionCompareResult
    const text = prompt(measured)
    expect(text).toContain("incidentRateDeltaPp=0.5")
    expect(text).not.toContain("incidentRatesMeasured")
  })

  it("names the confirming comparison and the element ranking", () => {
    expect(prompt(result)).toContain(
      "Tools: analytics_version_compare, analytics_element_bottleneck",
    )
  })
})
