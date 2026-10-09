import { describe, expect, it } from "vitest"
import { failureRateAskAiPrompt } from "./failure-rate-table.js"
import { errorPatternAskAiPrompt } from "./error-patterns-table.js"

describe("failureRateAskAiPrompt", () => {
  const prompt = failureRateAskAiPrompt({
    processDefinitionKey: "order",
    runningNow: 50,
    deadJobs: 3,
    openIncidents: 6,
    incidentRatePct: 12,
  })

  it("states the live figures it asks about — open incidents, not failed instances (N85)", () => {
    expect(prompt).toContain('"order" on the current engine has 6 open incident(s) right now')
    expect(prompt).toContain("(12 per 100 of its 50 running instances, 3 dead job(s))")
  })

  it("routes the regression check to tools that measure incident rates (#327)", () => {
    expect(prompt).toContain('analytics_compare_execution_periods (processDefinitionKey "order")')
    expect(prompt).toContain('analytics_cluster_compare (processDefinitionKey "order")')
    // Its incident rates are null per version — a wasted call for this question.
    expect(prompt).not.toContain("analytics_version_compare")
  })
})

describe("errorPatternAskAiPrompt (N117)", () => {
  const prompt = errorPatternAskAiPrompt({
    incidentType: "failedJob",
    processDefinitionKey: "order",
    incidentCount: 4,
  })

  it("names only what the open-incident metric carries", () => {
    expect(prompt).toContain('4 open "failedJob" incident(s) in process definition "order"')
    expect(prompt).not.toMatch(/first seen|last seen|sample instance/)
  })

  it("never passes the process key as an activity id", () => {
    expect(prompt).toContain(
      'camunda7_list_incidents({ processDefinitionKey: "order", incidentType: "failedJob" })',
    )
    expect(prompt).not.toContain('activity "order"')
    expect(prompt).not.toContain("activityId")
  })
})
