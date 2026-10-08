import { describe, expect, it } from "vitest"
import { failureRateAskAiPrompt } from "./failure-rate-table.js"

describe("failureRateAskAiPrompt", () => {
  const prompt = failureRateAskAiPrompt({
    processDefinitionKey: "order",
    totalInstances: 50,
    failedCount: 6,
    incidentCount: 3,
    failureRatePct: 12,
  })

  it("states the rate it asks about", () => {
    expect(prompt).toContain('"order" on the current engine shows a 12% failure rate')
    expect(prompt).toContain("(6 failed and 3 incident(s) out of 50 instances)")
  })

  it("routes the regression check to tools that measure failure rates (#327)", () => {
    expect(prompt).toContain('analytics_compare_execution_periods (processDefinitionKey "order")')
    expect(prompt).toContain('analytics_cluster_compare (processDefinitionKey "order")')
    // Its failure rates are null per version — a wasted call for this question.
    expect(prompt).not.toContain("analytics_version_compare")
  })
})
