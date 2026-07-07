import { describe, expect, it } from "vitest"
import { APP_ONLY_META, uiMeta } from "@miragon/mcp-toolkit-core"

const RESOURCE_URI = "ui://automation-mcp/mcp-app.test.html"

/**
 * Guards the locally patched toolkit widget contract
 * (patches/@miragon__mcp-toolkit-core@0.7.2.patch, applied via
 * `patchedDependencies` in pnpm-workspace.yaml): without the dual-protocol
 * `_meta` keys, ext-apps hosts (Claude Desktop / claude.ai) don't recognise
 * widget tools and every widget hangs on its loading skeleton. If this test
 * fails, the patch silently stopped being applied (e.g. after a toolkit
 * version bump without removing the patch entry, or a fresh install from a
 * lockfile that lost the patch hash). Remove this file together with the
 * patch once the toolkit ships the contract natively (planned 0.8.0).
 */
describe("uiMeta widget contract (patched toolkit 0.7.2)", () => {
  it("emits the dual-protocol widget keys for widget-rendering tools", () => {
    const meta = uiMeta({ resourceUri: RESOURCE_URI }) as Record<string, unknown>

    expect(meta.ui).toEqual({ resourceUri: RESOURCE_URI })
    expect(meta["ui/resourceUri"]).toBe(RESOURCE_URI)
    expect(meta["openai/outputTemplate"]).toBe(RESOURCE_URI)
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
