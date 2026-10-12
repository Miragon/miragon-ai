import { describe, expect, it, vi } from "vitest"
import type {
  AnalyticsDashboardData,
  EngineLandscapeResult,
  FailureDashboardData,
} from "@miragon-ai/analytics-client"
import { namedDashboard, namedFailureDashboard, namedLandscape } from "./named-views.js"
import type { NameLookup } from "./bpmn-name-lookup.js"

/** Every view asks for the names of exactly the ids it lists, no more. */
describe("named views", () => {
  const lookup = () => vi.fn<NameLookup>(() => Promise.resolve({}))

  it("the dashboard: its scope, its definitions and the elements of its activities", async () => {
    const namesFor = lookup()
    const data = {
      processDefinitionKey: "order",
      definitionBreakdown: [{ processDefinitionKey: "order" }, { processDefinitionKey: "refund" }],
      activityBreakdown: [
        { processDefinitionKey: "order", activityId: "Task_A" },
        { processDefinitionKey: "order", activityId: "Task_B" },
      ],
    } as unknown as AnalyticsDashboardData
    const named = await namedDashboard(data, namesFor)
    expect(named.names).toEqual({})
    const [keys, elementIds] = namesFor.mock.calls[0]
    expect([...keys]).toEqual(["order", "order", "refund", "order", "order"])
    expect(elementIds).toEqual({ order: ["Task_A", "Task_B"], refund: [] })
  })

  it("the failure dashboard and the landscape: process names only", async () => {
    const failures = lookup()
    await namedFailureDashboard(
      {
        errorPatterns: [{ processDefinitionKey: "a" }],
        processBreakdown: [{ processDefinitionKey: "b" }],
        mostAffectedProcess: "b",
      } as unknown as FailureDashboardData,
      failures,
    )
    expect([...failures.mock.calls[0][0]]).toEqual(["a", "b", "b"])
    expect(failures.mock.calls[0][1]).toEqual({ a: [], b: [] })

    const landscape = lookup()
    await namedLandscape(
      { processes: [{ processDefinitionKey: "c" }] } as unknown as EngineLandscapeResult,
      landscape,
    )
    expect(landscape.mock.calls[0][1]).toEqual({ c: [] })

    const none = lookup()
    await namedFailureDashboard(
      {
        errorPatterns: [],
        processBreakdown: [],
        mostAffectedProcess: null,
      } as unknown as FailureDashboardData,
      none,
    )
    expect([...none.mock.calls[0][0]]).toEqual([])
  })
})
