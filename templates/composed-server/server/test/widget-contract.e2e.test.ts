import net from "node:net"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { VIEW_RESOURCE_URI_PREFIX, viewResourceUri } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import type { MCPServer } from "mcp-use"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { getAppConfig, getPlugins } from "../src/setup.js"

const FIXTURE_JS = path.join(import.meta.dirname, "fixtures", "mcp-app.js")

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
 * Since mcp-use 2 the MCP Apps half (`_meta.ui.*`, the `ui://views/<tool>.html`
 * resources, the CSP) is emitted natively from each tool's `view`/`visibility`
 * binding — one view PER TOOL instead of 1.x's single shared app resource —
 * while the toolkit stamps the Apps SDK half (`openai/*`). The name-based
 * checks are the load-bearing part — they cover every module this app
 * composes, including custom ones, without listing tools by hand: a `*_show_*`
 * tool without its view binding hangs on the host's loading skeleton; a
 * model-visible `*_data` feed gets rendered by the host instead of feeding the
 * in-widget callTool.
 */
describe("widget wire contract (dual-protocol _meta)", () => {
  let app: MCPServer
  let client: Client
  let tools: ToolEntry[]
  let serverOrigin: string

  beforeAll(async () => {
    // The camunda7 module boots against a dead engine URL — tools register
    // fine; only actual calls would fail.
    vi.stubEnv("CAMUNDA_BASE_URL", "http://localhost:1")
    vi.stubEnv("CAMUNDA_ENGINES_FILE", undefined)
    vi.stubEnv("CAMUNDA_ENGINES_JSON", undefined)
    vi.stubEnv("CAMUNDA_COCKPIT_URL", undefined)
    vi.stubEnv("MCP_ACTIVE_MODULES", undefined)
    // Persistence must stay in-memory regardless of the dev shell's env.
    vi.stubEnv("MCP_PROFILE_DIR", undefined)
    vi.stubEnv("MCP_DASHBOARD_DIR", undefined)

    app = await createFrameworkApp({
      name: "acme-mcp",
      version: "0.1.0",
      host: "127.0.0.1",
      plugins: getPlugins() as AppPlugin[],
      appConfig: getAppConfig(),
      app: {
        bundle: { jsPath: FIXTURE_JS },
        builder: true,
      },
    })
    const port = await getFreePort()
    await app.listen(port)
    serverOrigin = `http://127.0.0.1:${port}`

    client = new Client({ name: "widget-contract-test", version: "0.0.0" })
    await client.connect(new StreamableHTTPClientTransport(new URL(`${serverOrigin}/mcp`)))
    tools = (await client.listTools()).tools
  })

  afterAll(async () => {
    await client?.close()
    await app?.close()
    vi.unstubAllEnvs()
  })

  it("registers the custom notes module alongside the Miragon modules", () => {
    const names = tools.map((t) => t.name)
    expect(names).toContain("notes_list_notes")
    expect(names).toContain("notes_show_notes")
    expect(names).toContain("notes_list_data")
  })

  it("emits the full dual-protocol _meta on every model-visible widget tool", () => {
    const widgetTools = tools.filter((t) => {
      const meta = t._meta
      if (!meta) return false
      const ui = uiBlock(meta)
      return typeof ui.resourceUri === "string" && ui.visibility === undefined
    })
    // render-view plus the camunda7/analytics/notes show_* tools.
    expect(widgetTools.length).toBeGreaterThanOrEqual(3)
    expect(widgetTools.map((t) => t.name)).toContain("render-view")

    for (const tool of widgetTools) {
      const meta = toolMeta(tool)
      const ui = uiBlock(meta)
      const label = tool.name
      // The view is named after the tool → per-tool view resource uri.
      expect(ui.resourceUri, `${label}: ui.resourceUri`).toBe(viewResourceUri(tool.name))
      expect(meta["openai/outputTemplate"], `${label}: outputTemplate`).toBe(
        viewResourceUri(tool.name),
      )
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

  it("carries widget _meta on every *_show_* tool (name-based — catches a forgotten view binding)", () => {
    // The meta-derived filter above can only check tools that HAVE meta; a
    // show tool that forgot its view binding would silently drop out of it and
    // hang on the host's loading skeleton. The naming convention is the
    // invariant we can enforce unconditionally.
    const showTools = tools.filter((t) => t.name.includes("_show_"))
    expect(showTools.length).toBeGreaterThanOrEqual(10)
    for (const tool of showTools) {
      const ui = uiBlock(toolMeta(tool))
      expect(ui.resourceUri, `${tool.name}: show tools must bind their own view`).toBe(
        viewResourceUri(tool.name),
      )
      expect(ui.visibility, `${tool.name}: show tools must stay model-visible`).toBeUndefined()
    }
  })

  it("marks every *_data feed app-only + widget-accessible (name-based — catches a forgotten visibility)", () => {
    const dataTools = tools.filter((t) => t.name.endsWith("_data"))
    expect(dataTools.length).toBeGreaterThanOrEqual(5)
    for (const tool of dataTools) {
      const meta = toolMeta(tool)
      const ui = uiBlock(meta)
      expect(
        Array.isArray(ui.visibility) && (ui.visibility as unknown[]).includes("app"),
        `${tool.name}: *_data feeds must carry visibility ["app"] — a model-visible feed ` +
          `would be rendered by the host instead of feeding the in-widget callTool`,
      ).toBe(true)
      expect(ui.resourceUri, `${tool.name}: *_data feeds must not carry a resourceUri`).toBe(
        undefined,
      )
      // The Apps-SDK half of the dual contract: those hosts only allow
      // in-widget callTool on tools carrying the key — a feed without it
      // renders fine but every pagination/search/refresh is denied.
      expect(
        meta["openai/widgetAccessible"],
        `${tool.name}: *_data feeds must be widget-accessible for Apps-SDK hosts`,
      ).toBe(true)
    }
  })

  it("keeps app-only tools (*_data feeds, refresh-view) free of widget keys", () => {
    const appOnlyTools = tools.filter((t) => {
      const ui = t._meta ? uiBlock(t._meta) : {}
      return Array.isArray(ui.visibility) && (ui.visibility as unknown[]).includes("app")
    })
    // refresh-view plus the *_data feeds.
    expect(appOnlyTools.length).toBeGreaterThanOrEqual(3)
    expect(appOnlyTools.map((t) => t.name)).toContain("refresh-view")

    for (const tool of appOnlyTools) {
      const meta = toolMeta(tool)
      const label = tool.name
      // A RENDERING key on an app-only feed would make hosts render its
      // result instead of returning it to the in-widget callTool.
      // `openai/widgetAccessible` is deliberately NOT in this list: it renders
      // nothing — it only authorizes the in-widget callTool on Apps-SDK hosts.
      expect(meta, `${label} must not advertise an output template`).not.toHaveProperty(
        "openai/outputTemplate",
      )
      expect(meta, `${label} must not carry the flat resource uri`).not.toHaveProperty(
        "ui/resourceUri",
      )
    }
  })

  it("lists one view resource per view-bound tool with the mcp-app profile mimeType", async () => {
    const { resources } = await client.listResources()
    const viewResources = resources.filter((r) => r.uri.startsWith(VIEW_RESOURCE_URI_PREFIX))
    const showTools = tools.filter((t) => t.name.includes("_show_"))
    for (const tool of showTools) {
      const resource = viewResources.find((r) => r.uri === viewResourceUri(tool.name))
      expect(resource, `view resource for ${tool.name} should be listed`).toBeDefined()
      expect(resource!.mimeType).toBe("text/html;profile=mcp-app")
    }
  })

  it("returns view html embedding the bundle with the request-resolved csp from resources/read", async () => {
    const uri = viewResourceUri("notes_show_notes")
    const { contents } = await client.readResource({ uri })
    const content = contents[0] as {
      uri: string
      mimeType?: string
      text?: string
      _meta?: Record<string, unknown>
    }
    expect(content.uri).toBe(uri)
    expect(content.mimeType).toBe("text/html;profile=mcp-app")
    expect(content.text).toContain("<html")

    const csp = uiBlock(content._meta ?? {}).csp as Record<string, string[]> | undefined
    expect(csp, "read contents should carry _meta.ui.csp").toBeTruthy()
    // mcp-use appends the request-resolved server origin itself since 2.x.
    expect(csp!.connectDomains).toContain(serverOrigin)
  })
})
