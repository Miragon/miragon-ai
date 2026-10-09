import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { bootServer, type BootedServer } from "./boot-server.js"
import { isModelVisible } from "./golden.js"

/**
 * Strict tool inputs on the wire (#329). A non-strict input schema lets the
 * server STRIP an unknown key before the handler runs: a misnamed optional
 * filter (`processDefinitionKey` on a tool that only knows
 * `processDefinitionId`) then returned engine-wide results with no error, and
 * the model attributed them to the process it asked about. Every module tool
 * — model-facing tools AND the app-only `*_data` feeds, which our own widgets
 * call (a stale widget argument must surface as an error, not as quietly
 * unfiltered data) — must refuse an unknown key with a tool error that names
 * the valid keys, and advertise `additionalProperties: false`.
 */

interface WireTool {
  name: string
  inputSchema: { properties?: Record<string, unknown>; additionalProperties?: unknown }
  _meta?: { ui?: { visibility?: unknown } } & Record<string, unknown>
}

/**
 * The toolkit's own framework tools (render-view, the dashboard builder, the
 * manifest): registered by `@miragon/mcp-toolkit-core` with no strict-input
 * option — reported upstream, out of this repo's reach. Pinned by name so a
 * MODULE tool can never slip into the exemption.
 */
const TOOLKIT_FRAMEWORK_TOOLS = [
  "delete-dashboard",
  "get-builder-catalogue",
  "get-framework-manifest",
  "list-dashboards",
  "load-dashboard",
  "refresh-view",
  "render-view",
  "save-dashboard",
]

const PROBE_KEY = "__strictInputProbe"

function errorText(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? []
  return content.map((part) => part.text ?? "").join("\n")
}

describe("strict tool inputs on the wire (full surface)", () => {
  let server: BootedServer
  let moduleTools: WireTool[]

  beforeAll(async () => {
    server = await bootServer({
      authenticated: true,
      env: {
        MCP_ACTIVE_MODULES: "camunda7:admin,analytics:standard",
        CAMUNDA_ALLOW_DEPLOYMENTS: "true",
      },
    })
    const { tools } = await server.client.listTools()
    const all = tools as unknown as WireTool[]
    moduleTools = all.filter((tool) => !TOOLKIT_FRAMEWORK_TOOLS.includes(tool.name))
    expect(
      all.filter((tool) => TOOLKIT_FRAMEWORK_TOOLS.includes(tool.name)).map((t) => t.name),
    ).toEqual(expect.arrayContaining(["render-view", "get-framework-manifest"]))
  })

  afterAll(async () => {
    await server?.close()
  })

  it("covers every module tool, model-facing and app-only (the guard is not vacuous)", () => {
    expect(moduleTools.every((tool) => /^(camunda7|analytics)_/.test(tool.name))).toBe(true)
    expect(moduleTools.filter(isModelVisible).length).toBeGreaterThanOrEqual(70)
    expect(moduleTools.filter((tool) => !isModelVisible(tool)).length).toBeGreaterThanOrEqual(15)
  })

  it("every module tool advertises additionalProperties: false", () => {
    const open = moduleTools
      .filter((tool) => tool.inputSchema.additionalProperties !== false)
      .map((tool) => tool.name)
    expect(open, "tools whose advertised input accepts unknown keys").toEqual([])
  })

  it("every module tool refuses an unknown key with a tool error naming the valid keys", async () => {
    const failures: string[] = []
    for (const tool of moduleTools) {
      const result = await server.client.callTool({
        name: tool.name,
        arguments: { [PROBE_KEY]: true },
      })
      const text = errorText(result)
      const valid = Object.keys(tool.inputSchema.properties ?? {})
      const named =
        valid.length === 0
          ? text.includes("This tool takes no arguments")
          : valid.every((key) => text.includes(JSON.stringify(key)))
      if (result.isError !== true || !text.includes(`Unknown key "${PROBE_KEY}"`) || !named) {
        failures.push(`${tool.name}: ${result.isError === true ? text : "accepted the call"}`)
      }
    }
    expect(failures).toEqual([])
  })
})
