import { describe, expect, it } from "vitest"
import {
  describeEngineLandscape,
  describeFailureRates,
  describeVersionCompare,
} from "./model-descriptions.js"
import type {
  EngineLandscapeEngine,
  EngineLandscapeResult,
  FailureDashboardData,
  VersionCompareKpi,
  VersionCompareResult,
} from "@miragon-ai/analytics-client"

const engine = (
  engineId: string,
  over: Partial<EngineLandscapeEngine> = {},
): EngineLandscapeEngine => ({
  engineId,
  reporting: true,
  runningInstances: 0,
  openIncidents: 0,
  failedJobs: 0,
  executableJobs: 0,
  suspendedJobs: 0,
  jobsDueFuture: 0,
  openExternalTasks: 0,
  deployedDefinitionKeys: 0,
  exclusiveDefinitionKeys: 0,
  ...over,
})

const landscape = (over: Partial<EngineLandscapeResult> = {}): EngineLandscapeResult => ({
  engines: [
    engine("prod-a", { runningInstances: 12, executableJobs: 3, deployedDefinitionKeys: 2 }),
    engine("prod-b", { runningInstances: 4, executableJobs: 90, deployedDefinitionKeys: 1 }),
  ],
  processes: [],
  sharedProcessKeys: ["order"],
  totals: {
    engineCount: 2,
    reportingEngineCount: 2,
    processKeyCount: 3,
    sharedProcessKeyCount: 1,
    runningInstances: 16,
    openIncidents: 2,
    failedJobs: 0,
  },
  ...over,
})

describe("describeEngineLandscape", () => {
  it("names the busiest engine, the largest backlog and the comparable process", () => {
    const text = describeEngineLandscape(landscape(), {})

    expect(text).toContain('most running work on "prod-a" (12)')
    expect(text).toContain('largest job backlog on "prod-b" (90 executable)')
    expect(text).toContain("order")
    expect(text).toContain("analytics_engine_compare")
  })

  it("tells the model why per-engine rates are absent", () => {
    // The whole point of the view: without this line a model would happily
    // divide the counts into per-engine rates and compare them again.
    expect(describeEngineLandscape(landscape(), {})).toContain("different process mixes")
  })

  it("states that no valid engine comparison exists when nothing is shared", () => {
    const text = describeEngineLandscape(landscape({ sharedProcessKeys: [] }), {})

    expect(text).toContain("No definition runs on more than one engine")
    expect(text).not.toContain("analytics_engine_compare with that")
  })

  it("calls out engines that report no metrics at all", () => {
    const text = describeEngineLandscape(
      landscape({
        engines: [
          engine("prod-a", { runningInstances: 1 }),
          engine("prod-c", { reporting: false }),
        ],
      }),
      {},
    )

    expect(text).toContain("reporting NO metrics: prod-c")
  })
})

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

const versionCompare = (
  kpis: VersionCompareKpi[],
  activityId: string | null = null,
): VersionCompareResult => ({
  processDefinitionKey: "order",
  versionA: 1,
  versionB: 2,
  windowDays: 14,
  activityId,
  minBucketSize: 10,
  suppressed: false,
  kpis,
  delta: {
    instance_count_delta_pct: 0,
    failure_rate_delta_pp: null,
    incident_rate_delta_pp: null,
    avg_duration_delta_pct: 25,
    p95_duration_delta_pct: null,
  },
  notes: [],
})

describe("describeVersionCompare", () => {
  it("names the measured delta and flags the incident rates as unknown, not zero (#327)", () => {
    const text = describeVersionCompare(versionCompare([versionKpi(1), versionKpi(2)]), {})

    expect(text).toContain("most notable delta: avg duration +25%")
    expect(text).toContain("not measured per version")
    expect(text).toContain("unknown, not zero")
  })

  it("drops the caveat once the incident rates are measured", () => {
    const measured = { failure_rate_pct: 1, incident_rate_pct: 1 }
    const text = describeVersionCompare(
      versionCompare([versionKpi(1, measured), versionKpi(2, measured)]),
      {},
    )
    expect(text).not.toContain("not measured per version")
  })

  it("never presents an activityId that scoped nothing as the comparison's scope", () => {
    const text = describeVersionCompare(
      versionCompare([versionKpi(1), versionKpi(2)], "Task_check"),
      {},
    )

    // The process-wide delta must not read as the element's.
    expect(text).not.toContain("element Task_check:")
    expect(text).toContain("over a 14d window: most notable delta: avg duration +25%")
    expect(text).toContain("activityId Task_check has no effect")
    expect(text).toContain("every figure covers the whole process")
  })

  it("scopes only the incident KPIs to the element once they are measured", () => {
    const measured = { failure_rate_pct: 1, incident_rate_pct: 1 }
    const text = describeVersionCompare(
      versionCompare([versionKpi(1, measured), versionKpi(2, measured)], "Task_check"),
      {},
    )
    expect(text).toContain("(incident KPIs scoped to element Task_check)")
    expect(text).not.toContain("has no effect")
  })
})

describe("describeFailureRates", () => {
  const failures: FailureDashboardData = {
    totalIncidents: 3,
    uniqueErrorPatterns: 1,
    mostAffectedProcess: "order",
    errorPatterns: [],
    processBreakdown: [
      {
        processDefinitionKey: "order",
        totalInstances: 50,
        failedCount: 6,
        incidentCount: 3,
        failureRatePct: 12,
      },
    ],
  }

  it("routes the regression check to tools that measure failure rates (#327)", () => {
    const text = describeFailureRates(failures, {})

    expect(text).toContain('highest "order" at 12%')
    expect(text).toContain("analytics_compare_execution_periods")
    expect(text).toContain("analytics_cluster_compare")
    // Its failure rates are null per version — a wasted call for this question.
    expect(text).not.toContain("analytics_version_compare")
  })
})
