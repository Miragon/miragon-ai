import { describe, expect, it } from "vitest"
import { createInMemoryProfileStore, runWithMcpRequestInfo } from "@miragon-ai/widget-shell/server"
import { camunda7Module } from "./module.js"
import { resolveEngine, type Camunda7StepAppConfig } from "./lib/resolve-engine.js"

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

  // Caller identity comes from OAuth alone (#331): without it no request has
  // an identity to save under, so the save refuses for every caller.
  it.each([
    ["no OAuth (no caller identity)", "operations", false],
    ["a read-only toolset without OAuth", "read-only", false],
    ["a read-only toolset under OAuth", "read-only", true],
  ])("never offers the save under %s", (_label, toolset, authenticated) => {
    const text = snippet(TWO, toolset, authenticated)
    expect(text).not.toContain("camunda7_select_engine")
    // Scoped: strict input (#329) refuses an `engine` on the tools that take
    // none (camunda7_list_engines, the profile tools), so "every call" alone
    // would cost a refused call there.
    expect(text).toContain(
      "This deployment cannot save a default: pass `engine` on every call that takes it.",
    )
  })

  it("states the cut-value rule for variable reads once", () => {
    expect(snippet(TWO, "operations", true)).toContain(
      "- Variable reads cut string values over 2000 chars (truncated: true): " +
        "never write such a value back — read that variable whole with variableName first.",
    )
  })

  it("one engine: `engine` may be omitted — no routing lecture", () => {
    const text = snippet([TWO[0]], "operations", true)
    expect(text).toContain('one engine is configured ("prod-a"); `engine` may be omitted.')
    expect(text).not.toContain("ENGINE_NOT_SELECTED")
  })

  /**
   * The boot-time text and the per-call ENGINE_NOT_SELECTED hint decide the
   * same question at different times; they must agree for the callers a boot
   * actually serves — under OAuth a signed-in caller (the tool call's ctx),
   * without it an HTTP request with no identity.
   */
  it.each([
    ["operations", true],
    ["operations", false],
    ["admin", true],
    ["read-only", true],
    ["read-only", false],
  ])("%s toolset, OAuth %s: instructions and ENGINE_NOT_SELECTED agree", async (toolset, oauth) => {
    const config = { engines: TWO, toolset }
    const offersSave = snippet(TWO, toolset, oauth).includes("camunda7_select_engine")
    const plugin = camunda7Module.createPlugin(config, {
      profileStore: createInMemoryProfileStore(),
    })
    const { registry } = plugin.appConfig as unknown as Camunda7StepAppConfig
    const call = oauth ? { auth: { user: { id: "user-1" } } } : {}
    const error = await runWithMcpRequestInfo({}, () =>
      resolveEngine(undefined, registry, call).then(
        () => undefined,
        (e: unknown) => e as Error,
      ),
    )
    expect(error?.message).toMatch(/^No engine specified/)
    expect(error?.message.includes("camunda7_select_engine")).toBe(offersSave)
    expect(offersSave).toBe(oauth && toolset !== "read-only")
  })
})
