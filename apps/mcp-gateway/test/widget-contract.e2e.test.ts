import net from "node:net"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { uiMeta } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { MCPClient, type MCPSession } from "mcp-use/client"
import type { McpServerInstance } from "mcp-use/server"
import { getAppConfig, getPlugins } from "../src/setup.js"

const FIXTURE_HTML = path.join(import.meta.dirname, "fixtures", "mcp-app.html")
const RESOURCE_URI = "ui://automation-mcp/mcp-app.widget-contract.html"
const BASE_URL = "http://127.0.0.1:8400"

/**
 * Whether the installed toolkit already emits the full dual-protocol widget
 * contract (toolkit >= 0.8.0, or a tarball-override candidate). On 0.7.2 —
 * even with the interim `patches/` fix, which covers only four keys — this is
 * false and the suite is skipped; it activates automatically with the toolkit
 * bump and then becomes the wire-level regression gate.
 */
const FULL_CONTRACT =
  "openai/toolInvocation/invoking" in uiMeta({ resourceUri: "ui://contract-probe" })

/** Reserve a free TCP port by binding to port 0 and releasing it again. */
async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

type ToolEntry = { name: string; _meta?: Record<string, unknown> }

function toolMeta(tool: ToolEntry | undefined): Record<string, unknown> {
  expect(tool?._meta, `${tool?.name ?? "tool"} should carry _meta`).toBeTruthy()
  return tool!._meta!
}

function uiBlock(meta: Record<string, unknown>): Record<string, unknown> {
  return (meta.ui ?? {}) as Record<string, unknown>
}

/**
 * Wire-level widget-contract assertions: what ext-apps hosts (Claude Desktop /
 * claude.ai) actually see on tools/list, resources/list and resources/read.
 * This is the contract whose absence made every widget hang on its loading
 * skeleton — see the dual-protocol keys in `uiMeta` (toolkit) and the
 * `_meta.ui.csp` on the app resource.
 */
describe.skipIf(!FULL_CONTRACT)("widget wire contract (dual-protocol _meta)", () => {
  let app: McpServerInstance<false>
  let client: MCPClient
  let session: MCPSession
  let tools: ToolEntry[]

  beforeAll(async () => {
    vi.stubEnv("CAMUNDA_BASE_URL", "http://localhost:1")
    vi.stubEnv("CAMUNDA_ENGINES_FILE", undefined)
    vi.stubEnv("CAMUNDA_ENGINES_JSON", undefined)
    vi.stubEnv("CAMUNDA_COCKPIT_URL", undefined)
    vi.stubEnv("MCP_ACTIVE_MODULES", undefined)

    app = await createFrameworkApp({
      name: "automation-mcp",
      version: "0.1.0",
      host: "127.0.0.1",
      baseUrl: BASE_URL,
      plugins: getPlugins() as AppPlugin[],
      proxies: [],
      appConfig: getAppConfig(),
      app: {
        resourceUri: RESOURCE_URI,
        htmlPath: FIXTURE_HTML,
        builder: true,
      },
    })
    const port = await getFreePort()
    await app.listen(port)

    client = MCPClient.fromDict({
      mcpServers: { gateway: { url: `http://127.0.0.1:${port}/mcp` } },
    })
    session = await client.createSession("gateway")
    tools = (await session.listTools()) as unknown as ToolEntry[]
  })

  afterAll(async () => {
    await client?.closeAllSessions()
    await app?.close()
    vi.unstubAllEnvs()
  })

  it("emits the full dual-protocol _meta on every model-visible widget tool", () => {
    const widgetTools = tools.filter((t) => {
      const meta = t._meta
      if (!meta) return false
      const ui = uiBlock(meta)
      return ui.resourceUri === RESOURCE_URI && ui.visibility === undefined
    })
    // render-view plus the camunda7/analytics show_* tools.
    expect(widgetTools.length).toBeGreaterThanOrEqual(3)
    expect(widgetTools.map((t) => t.name)).toContain("render-view")

    for (const tool of widgetTools) {
      const meta = toolMeta(tool)
      const label = tool.name
      expect(meta["ui/resourceUri"], `${label}: ui/resourceUri`).toBe(RESOURCE_URI)
      expect(meta["openai/outputTemplate"], `${label}: outputTemplate`).toBe(RESOURCE_URI)
      expect(meta["openai/widgetAccessible"], `${label}: widgetAccessible`).toBe(true)
      expect(meta["openai/resultCanProduceWidget"], `${label}: resultCanProduceWidget`).toBe(true)
      expect(meta["openai/toolInvocation/invoking"], `${label}: invoking`).toEqual(
        expect.stringMatching(/\S/),
      )
      expect(meta["openai/toolInvocation/invoked"], `${label}: invoked`).toEqual(
        expect.stringMatching(/\S/),
      )
    }
  })

  it("carries widget _meta on every *_show_* tool (name-based — catches a forgotten uiMeta)", () => {
    // The meta-derived filter above can only check tools that HAVE meta; a
    // show tool that forgot `uiMeta(...)` would silently drop out of it and
    // hang on the host's loading skeleton. The naming convention is the
    // invariant we can enforce unconditionally.
    const showTools = tools.filter((t) => t.name.includes("_show_"))
    expect(showTools.length).toBeGreaterThanOrEqual(10)
    for (const tool of showTools) {
      const ui = uiBlock(toolMeta(tool))
      expect(ui.resourceUri, `${tool.name}: show tools must render the app resource`).toBe(
        RESOURCE_URI,
      )
      expect(ui.visibility, `${tool.name}: show tools must stay model-visible`).toBeUndefined()
    }
  })

  it("marks every *_data feed app-only (name-based — catches a forgotten APP_ONLY_META)", () => {
    const dataTools = tools.filter((t) => t.name.endsWith("_data"))
    expect(dataTools.length).toBeGreaterThanOrEqual(5)
    for (const tool of dataTools) {
      const ui = uiBlock(toolMeta(tool))
      expect(
        Array.isArray(ui.visibility) && ui.visibility.includes("app"),
        `${tool.name}: *_data feeds must carry visibility ["app"] — a model-visible feed ` +
          `would be rendered by the host instead of feeding the in-widget callTool`,
      ).toBe(true)
      expect(ui.resourceUri, `${tool.name}: *_data feeds must not carry a resourceUri`).toBe(
        undefined,
      )
    }
  })

  it("keeps app-only tools (*_data feeds, refresh-view) free of widget keys", () => {
    const appOnlyTools = tools.filter((t) => {
      const ui = t._meta ? uiBlock(t._meta) : {}
      return Array.isArray(ui.visibility) && ui.visibility.includes("app")
    })
    // refresh-view, read-widget-bundle plus the *_data feeds.
    expect(appOnlyTools.length).toBeGreaterThanOrEqual(3)
    expect(appOnlyTools.map((t) => t.name)).toContain("refresh-view")

    for (const tool of appOnlyTools) {
      const meta = toolMeta(tool)
      const label = tool.name
      // A widget-meta key on an app-only feed would make hosts render its
      // result instead of returning it to the in-widget callTool (invariant 5).
      expect(meta, `${label} must not advertise an output template`).not.toHaveProperty(
        "openai/outputTemplate",
      )
      expect(meta, `${label} must not carry the flat resource uri`).not.toHaveProperty(
        "ui/resourceUri",
      )
      expect(meta, `${label} must not be widget-accessible-marked`).not.toHaveProperty(
        "openai/widgetAccessible",
      )
    }
  })

  it("lists the app resource with the mcp-app profile mimeType", async () => {
    const { resources } = await session.listResources()
    const appResource = resources.find((r) => r.uri === RESOURCE_URI)
    expect(appResource, "app resource should be listed").toBeDefined()
    // No `_meta` assertion on the LISTING: mcp-use 1.34.1 drops a resource
    // definition's `_meta` when replaying registrations into per-session SDK
    // servers (native mcpApps listings lose it the same way). Ext-apps hosts
    // read the CSP from the resources/read CONTENTS — asserted below.
    expect(appResource!.mimeType).toBe("text/html;profile=mcp-app")
  })

  it("returns the widget html with the mcp-app profile and _meta.ui.csp from resources/read", async () => {
    const { contents } = await session.readResource(RESOURCE_URI)
    const content = contents[0] as {
      uri: string
      mimeType?: string
      text?: string
      _meta?: Record<string, unknown>
    }
    expect(content.uri).toBe(RESOURCE_URI)
    expect(content.mimeType).toBe("text/html;profile=mcp-app")
    expect(content.text).toContain("<html")

    const csp = uiBlock(content._meta ?? {}).csp as Record<string, string[]> | undefined
    expect(csp, "read contents should carry _meta.ui.csp").toBeTruthy()
    expect(csp!.connectDomains).toContain(BASE_URL)
  })
})
