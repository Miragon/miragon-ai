import { describe, expect, it } from "vitest"
import { VIEW_RESOURCE_URI_PREFIX, appsSdkMeta, viewResourceUri } from "@miragon/mcp-toolkit-core"

/**
 * Fast guard on the INSTALLED toolkit's widget contract (>= 1.0.0, mcp-use 2
 * native views): the MCP Apps half (`_meta.ui.*`) is emitted by mcp-use from
 * the tool's `view`/`visibility` fields, while the toolkit stamps only the
 * Apps SDK half (`openai/*`) via `appsSdkMeta`. Without those keys Apps-SDK
 * hosts don't recognise widget tools and every widget hangs on its loading
 * skeleton. If this fails, the toolkit pin or lockfile resolved to a package
 * without the contract — the wire-level counterpart lives in
 * widget-contract.e2e.test.ts.
 */
describe("appsSdkMeta widget contract (installed toolkit)", () => {
  it("derives the stable mcp-use view resource uri from the view name", () => {
    expect(VIEW_RESOURCE_URI_PREFIX).toBe("ui://views/")
    expect(viewResourceUri("camunda7_show_process_list")).toBe(
      "ui://views/camunda7_show_process_list.html",
    )
  })

  it("emits the Apps SDK half for widget-rendering tools", () => {
    const resourceUri = viewResourceUri("camunda7_open_cockpit")
    const meta = appsSdkMeta({ resourceUri, title: "Cockpit" })

    expect(meta["openai/outputTemplate"]).toBe(resourceUri)
    expect(meta["openai/toolInvocation/invoking"]).toBe("Loading Cockpit...")
    expect(meta["openai/toolInvocation/invoked"]).toBe("Cockpit ready")
    expect(meta["openai/widgetAccessible"]).toBe(true)
    expect(meta["openai/resultCanProduceWidget"]).toBe(true)
  })

  it("never stamps the mcp-use-owned ui namespace", () => {
    const meta = appsSdkMeta({ resourceUri: viewResourceUri("x"), title: "X" })
    // mcp-use owns `_meta.ui` / `ui/*` (derived from view/visibility) and
    // overwrites them on tools/list — the toolkit must not fight it.
    for (const key of Object.keys(meta)) {
      expect(key === "ui" || key.startsWith("ui/"), `unexpected ui key ${key}`).toBe(false)
    }
  })
})
