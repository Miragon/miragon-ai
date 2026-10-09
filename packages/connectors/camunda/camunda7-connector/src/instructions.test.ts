import { describe, expect, it } from "vitest"
import { camunda7Module } from "./module.js"

/**
 * The engine routing rule lives ONCE in the server instructions (the `engine`
 * parameter only carries a one-line description), so the snippet must state
 * it for the boot at hand — and never offer a save the caller cannot make.
 */
describe("camunda7Module.instructions", () => {
  const TWO = [
    { id: "prod-a", baseUrl: "http://a/engine-rest" },
    { id: "prod-b", baseUrl: "http://b/engine-rest" },
  ]
  const snippet = (engines: unknown[], toolset: string, authenticated: boolean) =>
    camunda7Module.instructions({ engines, toolset }, { authenticated })

  it("several engines: names the ids and the routing precedence", () => {
    const text = snippet(TWO, "operations", true)
    expect(text).toContain("engines prod-a, prod-b (camunda7_list_engines groups them")
    expect(text).toContain(
      "A call routes to its `engine` argument, else to the caller's saved default, else fails with ENGINE_NOT_SELECTED.",
    )
    expect(text).toContain("camunda7_select_engine saves the caller's default.")
    expect(text).toMatch(/ISO 8601/)
    expect(text).toMatch(/camunda7_show_engine_health judges ONE engine from its open incidents/)
  })

  it.each([
    ["no OAuth (no caller identity)", "operations", false],
    ["a read-only toolset", "read-only", true],
  ])("never offers the save under %s", (_label, toolset, authenticated) => {
    const text = snippet(TWO, toolset, authenticated)
    expect(text).not.toContain("camunda7_select_engine")
    expect(text).toContain("This deployment cannot save a default: pass `engine` on every call.")
  })

  it("one engine: `engine` may be omitted — no routing lecture", () => {
    const text = snippet([TWO[0]], "operations", true)
    expect(text).toContain('one engine is configured ("prod-a"); `engine` may be omitted.')
    expect(text).not.toContain("ENGINE_NOT_SELECTED")
  })
})
