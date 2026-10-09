import { describe, expect, it } from "vitest"
import type { VersionCompareKpi, VersionCompareResult } from "@miragon-ai/analytics-client"
import { translator } from "../messages/index.js"
import type { T } from "../messages/use-t.js"
import { versionCompareCaveats } from "../version-compare-caveats.js"
import { versionCompareAskAiPrompt, versionCompareNote } from "./version-compare.js"

const t: T = (key, params) => translator("en", key, params)

const versionKpi = (version: number, over: Partial<VersionCompareKpi> = {}): VersionCompareKpi => ({
  version,
  bucket: version === 1 ? "versionA" : "versionB",
  instance_count: 100,
  completed_count: 90,
  failed_count: null,
  failure_rate_pct: null,
  incident_count: null,
  incident_rate_pct: null,
  avg_duration_sec: 10,
  p95_duration_sec: 20,
  ...over,
})

const measured = { failure_rate_pct: 1, incident_rate_pct: 1 }

const result = (
  elementId: string | null,
  over: Partial<VersionCompareKpi> = {},
): VersionCompareResult => ({
  processDefinitionKey: "order",
  versionA: 1,
  versionB: 2,
  windowDays: 14,
  elementId,
  minBucketSize: 10,
  suppressed: false,
  kpis: [versionKpi(1, over), versionKpi(2, over)],
  delta: {
    instance_count_delta_pct: 0,
    failure_rate_delta_pp: null,
    incident_rate_delta_pp: null,
    avg_duration_delta_pct: 25,
    p95_duration_delta_pct: 40,
  },
  notes: [],
})

const note = (data: VersionCompareResult) => versionCompareNote(t, versionCompareCaveats(data))
const prompt = (data: VersionCompareResult) =>
  versionCompareAskAiPrompt(data, versionCompareCaveats(data))

describe("versionCompareNote", () => {
  it("explains the n/a rates", () => {
    expect(note(result(null))).toBe(t("aVersionCompare.incidentKpisUnavailable"))
  })

  it("adds that an elementId scoped nothing (#327)", () => {
    const text = note(result("Task_check"))
    expect(text).toContain(t("aVersionCompare.incidentKpisUnavailable"))
    expect(text).toContain("The element filter Task_check has no effect here")
    expect(text).toContain("Every figure covers the whole process.")
  })

  it("shows no note once every KPI is measured", () => {
    expect(note(result("Task_check", measured))).toBeUndefined()
  })
})

describe("versionCompareAskAiPrompt", () => {
  it("never presents an elementId that scoped nothing as the comparison's scope (#327)", () => {
    const text = prompt(result("Task_check"))

    expect(text).not.toContain("scoped to BPMN element")
    expect(text).toContain("over a 14-day window. The on-screen deltas are:")
    expect(text).toContain("The elementId Task_check has no effect here")
    expect(text).toContain("every figure covers the whole process, not that element")
    expect(text).toContain("treat them as unknown, not as zero")
  })

  it("names no element when none was passed", () => {
    expect(prompt(result(null))).not.toContain("elementId")
  })

  it("scopes only the incident KPIs to the element once they are measured", () => {
    const text = prompt(result("Task_check", measured))
    expect(text).toContain("window, incident KPIs scoped to BPMN element Task_check.")
    expect(text).not.toContain("has no effect")
    expect(text).not.toContain("unknown, not as zero")
  })
})
