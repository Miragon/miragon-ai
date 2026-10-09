import { describe, expect, it } from "vitest"
import type { MCPServer } from "mcp-use"
import type { PrometheusClient, VersionCompareResult } from "@miragon-ai/analytics-client"
import { registerComparisonWidgetTools } from "./comparisons.js"

type ToolResult = {
  content: Array<{ type: string; text: string }>
  structuredContent: { context: { stepData: { result: { data: unknown } } } }
}
type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>

/** Registers the comparison widget tools on a stand-in server and returns their handlers. */
function handlers(ch: PrometheusClient): Map<string, Handler> {
  const byName = new Map<string, Handler>()
  const server = {
    tool: (definition: { name: string }, handler: Handler) => {
      byName.set(definition.name, handler)
    },
  } as unknown as MCPServer
  registerComparisonWidgetTools({ server, ch })
  return byName
}

/** Every query answers 20, so instance counts and durations are equal across versions. */
const ch: PrometheusClient = { instant: () => Promise.resolve([{ metric: {}, value: 20 }]) }

describe("analytics_show_version_compare", () => {
  it("never summarises the unmeasured failure rate as 0pp (#327)", async () => {
    const show = handlers(ch).get("analytics_show_version_compare")!
    const result = await show(
      { processDefinitionKey: "order", versionA: 1, versionB: 2, windowDays: 14 },
      {},
    )

    const summary = result.content[0].text
    expect(summary).toContain("failure rate n/a")
    expect(summary).toContain("unavailable per version")
    expect(summary).not.toMatch(/0pp/)

    const data = result.structuredContent.context.stepData.result.data as VersionCompareResult
    expect(data.kpis.map((k) => k.failure_rate_pct)).toEqual([null, null])
    expect(data.notes.length).toBeGreaterThan(0)
    expect(summary).not.toContain("elementId")
  })

  it("says an elementId scoped nothing instead of implying an element scope (#327)", async () => {
    const show = handlers(ch).get("analytics_show_version_compare")!
    const result = await show(
      {
        processDefinitionKey: "order",
        versionA: 1,
        versionB: 2,
        windowDays: 14,
        elementId: "Task_check",
      },
      {},
    )

    const summary = result.content[0].text
    expect(summary).toContain("elementId Task_check has no effect")
    expect(summary).toContain("every figure covers the whole process")
  })
})
