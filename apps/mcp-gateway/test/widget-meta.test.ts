import { describe, expect, it } from "vitest"
import { APP_ONLY_META, uiMeta } from "@miragon/mcp-toolkit-core"

const RESOURCE_URI = "ui://automation-mcp/mcp-app.test.html"

/**
 * Fast guard on the INSTALLED toolkit's widget contract (>= 0.8.0): without
 * the dual-protocol `_meta` keys, ext-apps hosts (Claude Desktop / claude.ai)
 * don't recognise widget tools and every widget hangs on its loading
 * skeleton. If this fails, the toolkit pin or lockfile resolved to a package
 * without the contract — the wire-level counterpart lives in
 * widget-contract.e2e.test.ts.
 */
describe("uiMeta widget contract (installed toolkit)", () => {
  it("emits the dual-protocol widget keys for widget-rendering tools", () => {
    const meta = uiMeta({ resourceUri: RESOURCE_URI, title: "Cockpit" }) as Record<string, unknown>

    expect(meta.ui).toEqual({ resourceUri: RESOURCE_URI })
    expect(meta["ui/resourceUri"]).toBe(RESOURCE_URI)
    expect(meta["openai/outputTemplate"]).toBe(RESOURCE_URI)
    expect(meta["openai/toolInvocation/invoking"]).toBe("Loading Cockpit...")
    expect(meta["openai/toolInvocation/invoked"]).toBe("Cockpit ready")
    expect(meta["openai/widgetAccessible"]).toBe(true)
    expect(meta["openai/resultCanProduceWidget"]).toBe(true)
  })

  it("keeps app-only tools free of widget keys so hosts never render them", () => {
    const appOnly = uiMeta({ resourceUri: RESOURCE_URI, appOnly: true }) as Record<string, unknown>

    expect(appOnly.ui).toEqual({ resourceUri: RESOURCE_URI, visibility: ["app"] })
    expect(appOnly).not.toHaveProperty("ui/resourceUri")
    expect(appOnly).not.toHaveProperty("openai/outputTemplate")
    expect(appOnly).not.toHaveProperty("openai/widgetAccessible")
    expect(appOnly).not.toHaveProperty("openai/resultCanProduceWidget")
  })

  it("leaves APP_ONLY_META untouched", () => {
    expect(APP_ONLY_META).toEqual({ ui: { visibility: ["app"] } })
  })
})
