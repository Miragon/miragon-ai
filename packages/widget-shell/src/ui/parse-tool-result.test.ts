import { describe, expect, it } from "vitest"
import { parseToolResult } from "./parse-tool-result.js"

describe("parseToolResult (toolkit result-parsing contract)", () => {
  it("decodes JSON from the first text content block", () => {
    const result = {
      content: [{ type: "text", text: JSON.stringify({ items: [1, 2], total: 2 }) }],
      structuredContent: { ignored: true },
    }
    expect(parseToolResult(result)).toEqual({ items: [1, 2], total: 2 })
  })

  it("returns non-JSON text verbatim", () => {
    const result = { content: [{ type: "text", text: "plain status line" }] }
    expect(parseToolResult<string>(result)).toBe("plain status line")
  })

  it("falls back to structuredContent when there is no text channel", () => {
    const result = { structuredContent: { fromStructured: true } }
    expect(parseToolResult(result)).toEqual({ fromStructured: true })
  })

  it("falls back to the raw result when neither channel is present", () => {
    const result = { something: "else" }
    expect(parseToolResult(result)).toEqual({ something: "else" })
  })

  it("throws the first text block as the error message on isError results", () => {
    const result = { isError: true, content: [{ type: "text", text: "boom" }] }
    expect(() => parseToolResult(result)).toThrowError("boom")
  })

  it("throws a generic message on isError results without content", () => {
    expect(() => parseToolResult({ isError: true })).toThrowError("Tool call failed")
  })
})
