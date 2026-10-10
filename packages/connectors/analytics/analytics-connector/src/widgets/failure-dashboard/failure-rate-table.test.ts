import { describe, expect, it } from "vitest"
import { failureRateHandOff } from "./failure-rate-table.js"
import { errorPatternHandOff } from "./error-patterns-table.js"
import { ANALYTICS_ONLY_SURFACE, analyticsSurface, bindHandOff } from "../hand-off.js"

const ask = bindHandOff("en", ANALYTICS_ONLY_SURFACE).ask

describe("failureRateHandOff", () => {
  const prompt = ask(
    failureRateHandOff(
      {
        processDefinitionKey: "order",
        runningNow: 50,
        deadJobs: 3,
        openIncidents: 6,
        incidentRatePct: 12,
      },
      { engines: ["prod-a"] },
    ),
  )!

  it("states the live figures it asks about — open incidents, not failed instances (N85)", () => {
    expect(prompt).toContain('Ids: engine="prod-a", processDefinitionKey="order"')
    expect(prompt).toContain(
      "On screen: openIncidentsNow=6, runningNow=50, incidentRatePct=12, deadJobs=3",
    )
    expect(prompt).not.toMatch(/failed|failure/i)
  })

  it("leaves an unmeasured rate out instead of sending it as 0", () => {
    const idle = ask(
      failureRateHandOff(
        {
          processDefinitionKey: "order",
          runningNow: 0,
          deadJobs: 0,
          openIncidents: 2,
          incidentRatePct: null,
        },
        { engines: ["prod-a"] },
      ),
    )!
    expect(idle).not.toContain("incidentRatePct")
  })

  it("routes the regression check to tools that measure incident rates (#327)", () => {
    expect(prompt).toContain("analytics_compare_execution_periods")
    expect(prompt).toContain("analytics_cluster_compare")
    // Its incident rates are null per version — a wasted call for this question.
    expect(prompt).not.toContain("analytics_version_compare")
  })
})

describe("errorPatternHandOff (N117)", () => {
  const pattern = { incidentType: "failedJob", processDefinitionKey: "order", incidentCount: 4 }

  it("names only what the open-incident metric carries", () => {
    const prompt = ask(errorPatternHandOff(pattern, { engines: ["prod-a"] }))!
    expect(prompt).toContain(
      'Ids: engine="prod-a", processDefinitionKey="order", incidentType="failedJob"',
    )
    expect(prompt).toContain("On screen: openIncidentsNow=4")
    expect(prompt).not.toMatch(/first seen|last seen|sample instance|activityId/i)
  })

  it("names the aggregate's engines, never a placeholder", () => {
    const prompt = ask(errorPatternHandOff(pattern, { engines: ["prod-a", "prod-b"] }))!
    expect(prompt).toContain('engine=["prod-a","prod-b"]')
  })

  it("names the camunda7 reads only where camunda7 registers them", () => {
    const withCamunda7 = bindHandOff("en", analyticsSurface(["camunda7_list_incidents"])).ask(
      errorPatternHandOff(pattern, { engines: ["prod-a"] }),
    )!
    expect(withCamunda7).toContain(
      "Tools: analytics_find_failed_instances, camunda7_list_incidents",
    )
    expect(ask(errorPatternHandOff(pattern, { engines: ["prod-a"] }))).not.toContain("camunda7_")
  })
})
