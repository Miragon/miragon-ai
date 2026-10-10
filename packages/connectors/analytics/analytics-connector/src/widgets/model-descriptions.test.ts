import { describe, expect, it } from "vitest"
import type { AnalyticsBpmnHeatmapData } from "./bpmn-heatmap.js"
import {
  describeActivityBottlenecks,
  describeBpmnHeatmap,
  describeEngineLandscape,
  describeErrorPatterns,
  describeExecutionPerformance,
  describeExecutionSummary,
  describeFailureRates,
  describeFailureSummary,
  describeVersionCompare,
} from "./model-descriptions.js"
import type {
  AnalyticsDashboardData,
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
  incident_count: null,
  incident_rate_pct: null,
  element_incident_count: null,
  element_incident_rate_pct: null,
  avg_duration_sec: 10,
  p95_duration_sec: 20,
  ...over,
})

const versionCompare = (
  kpis: VersionCompareKpi[],
  engines: string[] | null = ["prod-a"],
): VersionCompareResult => ({
  engines,
  processDefinitionKey: "order",
  versionA: 1,
  versionB: 2,
  windowDays: 14,
  minBucketSize: 10,
  suppressed: false,
  kpis,
  delta: {
    started_per_day_delta_pct: 0,
    incident_rate_delta_pp: null,
    element_incident_rate_delta_pp: null,
    avg_duration_delta_pct: 25,
    p95_duration_delta_pct: null,
  },
  notes: [],
})

/** Version KPIs once the incident metric carries a version label (#337). */
const measured = {
  incident_count: 1,
  incident_rate_pct: 1,
} as unknown as Partial<VersionCompareKpi>

describe("describeVersionCompare", () => {
  it("names the measured delta and flags the incident rates as unknown, not zero (#327)", () => {
    const text = describeVersionCompare(versionCompare([versionKpi(1), versionKpi(2)]), {})

    expect(text).toContain(
      'over a 14d window on engine "prod-a": most notable delta: avg duration +25%',
    )
    expect(text).toContain("not measured per version")
    expect(text).toContain("unknown, not zero")
  })

  it("names every engine of a fleet comparison (K33)", () => {
    const text = describeVersionCompare(
      versionCompare([versionKpi(1), versionKpi(2)], ["prod-a", "prod-b"]),
      {},
    )
    expect(text).toContain('across engines "prod-a", "prod-b" (aggregated)')
  })

  it("drops the caveat once the incident rates are measured", () => {
    const text = describeVersionCompare(
      versionCompare([versionKpi(1, measured), versionKpi(2, measured)]),
      {},
    )
    expect(text).not.toContain("not measured per version")
  })
})

const failures = (engines: string[] | null): FailureDashboardData => ({
  engines,
  totalIncidents: 6,
  uniqueErrorPatterns: 1,
  mostAffectedProcess: "order",
  errorPatterns: [{ incidentType: "failedJob", processDefinitionKey: "order", incidentCount: 6 }],
  processBreakdown: [
    {
      processDefinitionKey: "order",
      runningNow: 50,
      deadJobs: 3,
      openIncidents: 6,
      incidentRatePct: 12,
    },
  ],
})

describe("describeFailureRates", () => {
  it("states live open incidents per running instance and routes the regression check (#327)", () => {
    const text = describeFailureRates(failures(["prod-a"]), {})

    expect(text).toContain('(incidents open right now on engine "prod-a")')
    expect(text).toContain(
      'highest rate "order" with 6 open incident(s) on 50 running instance(s) (12%)',
    )
    expect(text).toContain("analytics_compare_execution_periods")
    expect(text).toContain("analytics_cluster_compare")
    // Its incident rates are null per version — a wasted call for this question.
    expect(text).not.toContain("analytics_version_compare")
  })
})

describe("failure-dashboard scope (N83/N116)", () => {
  it("names the engines from the data, not from cell props — a self-fetch keeps its label", () => {
    expect(describeFailureSummary(failures(["prod-a", "prod-b"]), {})).toContain(
      '(incidents open right now across engines "prod-a", "prod-b" (aggregated))',
    )
    // Props claiming another engine never override what the data covers.
    expect(describeFailureSummary(failures(["prod-a"]), { engine: "prod-b" })).toContain(
      'on engine "prod-a"',
    )
  })

  it("presents only fields the open-incident metric fills (N117)", () => {
    const text = describeErrorPatterns(failures(["prod-a"]), {})
    expect(text).toContain('largest: 6 "failedJob" in "order"')
    expect(text).toContain("no message, activity or timestamps")
  })
})

const dashboard = (over: Partial<AnalyticsDashboardData> = {}): AnalyticsDashboardData => ({
  processDefinitionKey: null,
  period: "7d",
  engines: ["prod-a", "prod-b"],
  totalCount: 40,
  completedCount: 30,
  incidentsCreated: 5,
  incidentsResolved: 2,
  incidentRatePct: 12.5,
  avgDurationMs: 60_000,
  medianDurationMs: 45_000,
  p95DurationMs: 187_000,
  runningNow: 156,
  openIncidentsNow: 12,
  activityBreakdown: [],
  definitionBreakdown: [],
  ...over,
})

describe("dashboard model descriptions", () => {
  it("labels the fleet aggregate with its engines and the period it covers (K33)", () => {
    expect(describeExecutionSummary(dashboard(), {})).toContain(
      'for 0 process definition(s) over 7d across engines "prod-a", "prod-b" (aggregated)',
    )
  })

  it("keeps window flows and the live gauges apart (N77)", () => {
    const text = describeExecutionSummary(dashboard(), {})
    expect(text).toContain(
      "within the period 40 instance(s) started, 30 completed, 5 incident(s) created",
    )
    expect(text).toContain("right now 156 running and 12 incident(s) open")
  })

  it("never reads an unreported gauge or an empty duration window as 0 (N78)", () => {
    const text = describeExecutionSummary(
      dashboard({ runningNow: null, openIncidentsNow: null }),
      {},
    )
    expect(text).toContain("not measured running and not measured incident(s) open")
    const perf = describeExecutionPerformance(
      dashboard({
        avgDurationMs: null,
        medianDurationMs: null,
        p95DurationMs: null,
        incidentRatePct: null,
      }),
      {},
    )
    expect(perf).toContain("(none ended)")
    expect(perf).toContain("not measured incidents per 100 started instances")
    expect(perf).not.toMatch(/\b0(ms|s)\b/)
  })

  it("names the process of the top activity — ids repeat across models (N84)", () => {
    const text = describeActivityBottlenecks(
      dashboard({
        activityBreakdown: [
          {
            processDefinitionKey: "invoice",
            activityId: "StartEvent_1",
            activityType: "startEvent",
            executionCount: 9,
            avgDurationMs: 10,
            p95DurationMs: 20,
            totalTimeMs: 90,
          },
        ],
      }),
      {},
    )
    expect(text).toContain('top bottleneck activity StartEvent_1 of process "invoice"')
  })
})

describe("describeBpmnHeatmap", () => {
  const heatmap = (engines: string[]): AnalyticsBpmnHeatmapData => ({
    processDefinitionKey: "order",
    period: "7d",
    engines,
    bpmnXml: null,
    frequency: { Task_A: 12 },
    durationSec: { Task_A: 3.25 },
  })

  it("names the engines whose heat it adds up (K33)", () => {
    expect(describeBpmnHeatmap(heatmap(["prod-a", "prod-b"]), {})).toContain(
      'for process "order" over 7d across engines "prod-a", "prod-b" (aggregated):',
    )
    expect(describeBpmnHeatmap(heatmap(["prod-b"]), {})).toContain(
      'for process "order" over 7d on engine "prod-b":',
    )
  })
})
