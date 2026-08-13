import { describe, expect, it } from "vitest"
import { appOnly, showToolBinding } from "./widget-tool-bindings.js"

describe("showToolBinding", () => {
  it("binds the view to the tool name and stamps the Apps-SDK _meta half", () => {
    const binding = showToolBinding("camunda7_show_thing", "Thing")
    expect(binding.view).toEqual({ name: "camunda7_show_thing" })
    expect(binding._meta).toMatchObject({
      "openai/outputTemplate": "ui://views/camunda7_show_thing.html",
      "openai/widgetAccessible": true,
    })
  })

  it("carries a passthrough outputSchema (mcp-use requires one for view-bound tools)", () => {
    const binding = showToolBinding("t", "T")
    // Free-form structuredContent must survive SDK-side validation unstripped.
    expect(binding.outputSchema.parse({ anything: 1, nested: { x: true } })).toEqual({
      anything: 1,
      nested: { x: true },
    })
  })
})

describe("appOnly", () => {
  it("marks the tool app-only + widget-accessible, without any rendering keys", () => {
    expect(appOnly.visibility).toBe("app")
    expect(appOnly._meta).toEqual({ "openai/widgetAccessible": true })
    // No view binding and no outputTemplate — a feed result must never be
    // rendered by the host (invariant 5).
    expect(appOnly).not.toHaveProperty("view")
  })
})
