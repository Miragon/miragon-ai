import { describe, expect, it } from "vitest"
import { describeEngineLandscape } from "./model-descriptions.js"
import type { EngineLandscapeEngine, EngineLandscapeResult } from "@miragon-ai/analytics-client"

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
