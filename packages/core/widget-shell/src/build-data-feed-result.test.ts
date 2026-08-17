import { describe, expect, it } from "vitest"
import { buildDataFeedResult } from "./server.js"
import { parseViewToolResult } from "./ui/parse-tool-result.js"

/**
 * The app-only `*_data` feed result (architecture invariant 5): the payload on
 * BOTH channels and deliberately no widget `_meta` — a result carrying
 * `ui.resourceUri` would be rendered by the host instead of being returned to
 * the in-widget `callTool()`, which is exactly the bug this single shared
 * implementation exists to prevent.
 */
describe("buildDataFeedResult", () => {
  const data = { rows: [{ id: "pi-1" }], total: 1 }
  const result = buildDataFeedResult(data)

  it("puts the payload on the text channel as JSON", () => {
    expect(result.content).toEqual([{ type: "text", text: '{"rows":[{"id":"pi-1"}],"total":1}' }])
  })

  it("passes the payload through as structuredContent for the in-widget caller", () => {
    expect(result.structuredContent).toBe(data)
    expect(parseViewToolResult(result)).toEqual(data)
  })

  it("carries nothing else — no widget _meta, no view binding", () => {
    expect(Object.keys(result).sort()).toEqual(["content", "structuredContent"])
  })

  it("stays a plain JSON envelope for an empty payload", () => {
    const empty = buildDataFeedResult({})
    expect(empty.content).toEqual([{ type: "text", text: "{}" }])
    expect(empty.structuredContent).toEqual({})
  })
})
