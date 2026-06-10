import { describe, expect, it } from "vitest"
import { parseToolResult, parseViewToolResult } from "./parse-tool-result.js"

describe("parseToolResult (structuredContent-first contract)", () => {
  it("prefers structuredContent over the text channel", () => {
    const result = {
      content: [{ type: "text", text: "Process list: 2 definitions." }],
      structuredContent: { items: [1, 2], total: 2 },
    }
    expect(parseToolResult(result)).toEqual({ items: [1, 2], total: 2 })
  })

  it("prefers structuredContent even when the text channel is parseable JSON", () => {
    const result = {
      content: [{ type: "text", text: JSON.stringify({ fromText: true }) }],
      structuredContent: { fromStructured: true },
    }
    expect(parseToolResult(result)).toEqual({ fromStructured: true })
  })

  it("falls back to JSON-decoding the first text block without structuredContent", () => {
    const result = {
      content: [{ type: "text", text: JSON.stringify({ items: [1, 2], total: 2 }) }],
    }
    expect(parseToolResult(result)).toEqual({ items: [1, 2], total: 2 })
  })

  it("returns non-JSON text verbatim without structuredContent", () => {
    const result = { content: [{ type: "text", text: "plain status line" }] }
    expect(parseToolResult<string>(result)).toBe("plain status line")
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

describe("parseViewToolResult (show-tool envelope unwrap)", () => {
  it("unwraps a single-step view envelope to the widget's flat data", () => {
    const result = {
      content: [{ type: "text", text: "Model summary." }],
      structuredContent: {
        title: "Instances",
        context: {
          keys: {},
          stepIds: ["result"],
          stepData: { result: { data: { rows: [1], total: 1 }, keys: {} } },
          errors: [],
        },
        layout: [],
      },
    }
    expect(parseViewToolResult(result)).toEqual({ rows: [1], total: 1 })
  })

  it("returns multi-step composed views keyed by step id", () => {
    const result = {
      structuredContent: {
        context: {
          stepIds: ["kpis", "result_1"],
          stepData: {
            kpis: { data: { totalCount: 5 } },
            result_1: { data: { patterns: [] } },
          },
        },
        layout: [],
      },
    }
    expect(parseViewToolResult(result)).toEqual({
      kpis: { totalCount: 5 },
      result_1: { patterns: [] },
    })
  })

  it("passes non-envelope results (e.g. *_data feeds) through unchanged", () => {
    const data = { jobs: [], totalCount: 0 }
    const result = {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: data,
    }
    expect(parseViewToolResult(result)).toEqual(data)
  })

  it("propagates isError results as thrown errors", () => {
    const result = { isError: true, content: [{ type: "text", text: "boom" }] }
    expect(() => parseViewToolResult(result)).toThrowError("boom")
  })
})
