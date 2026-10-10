import { describe, expect, it } from "vitest"
import type { VersionCompareKpi, VersionCompareResult } from "@miragon-ai/analytics-client"
import { translator } from "../messages/index.js"
import type { T } from "../messages/use-t.js"
import { versionCompareCaveats } from "../version-compare-caveats.js"
import { versionCompareAskAiPrompt, versionCompareNote } from "./version-compare.js"

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

describe("versionCompareAskAiPrompt", () => {
  it("carries the caveat: the incident rates are unknown, not zero (#327)", () => {
    const text = versionCompareAskAiPrompt(result, versionCompareCaveats(result))

    expect(text).toContain("over a 14-day window. The on-screen deltas are:")
    expect(text).toContain("starts per day 0.0%, incident rate —, avg duration +25.0%")
    expect(text).toContain("treat them as unknown, not as zero")
    // The tool takes no element scope — the prompt must not suggest one.
    expect(text).not.toContain("activityId")
  })
})
