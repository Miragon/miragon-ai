import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import type { RunningServer } from "@miragon-ai/widget-shell/server"
import { createApp } from "../src/app.js"
import { stubNeutralEnv } from "./neutral-env.js"

const FIXTURE_JS = path.join(import.meta.dirname, "fixtures", "mcp-app.js")

/**
 * The toolkit's own framework tools (render-view & co.): registered by
 * `@miragon/mcp-toolkit-core` without a strict-input option, out of this
 * server's reach. Pinned by name so a MODULE tool can never slip into the
 * exemption.
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

interface WireTool {
  name: string
  inputSchema: { properties?: Record<string, unknown>; additionalProperties?: unknown }
}

function errorText(result: unknown): string {
  const content = (result as { content?: Array<{ text?: string }> }).content ?? []
  return content.map((part) => part.text ?? "").join("\n")
}

/**
 * Strict tool inputs across EVERY composed module, yours included. A
 * non-strict input schema lets the server STRIP an unknown key before the
 * handler runs: a misnamed optional filter then silently widens the result
 * and the model never learns. Registrar tools take `{ strictInput: true }`
 * (`createToolRegistrar`), raw `server.tool()` registrations
 * `strictToolInput(shape)` (`@miragon-ai/widget-shell/server`) — then an
 * unknown key is a tool error naming the valid keys, which the model fixes
 * in one retry.
 */
describe("strict tool inputs on the wire (every module)", () => {
  let app: RunningServer
  let client: Client
  let moduleTools: WireTool[]

  beforeAll(async () => {
    stubNeutralEnv()
    const composed = await createApp(process.env, { bundle: { jsPath: FIXTURE_JS } })
    app = await composed.listen({ port: 0, host: "127.0.0.1" })
    client = new Client({ name: "strict-input-test", version: "0.0.0" })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${app.port}/mcp`)),
    )
    const tools = (await client.listTools()).tools as unknown as WireTool[]
    moduleTools = tools.filter((tool) => !TOOLKIT_FRAMEWORK_TOOLS.includes(tool.name))
  })

  afterAll(async () => {
    await client?.close()
    await app?.shutdown()
    vi.unstubAllEnvs()
  })

  it("covers the custom notes module next to the Miragon modules (the guard is not vacuous)", () => {
    const names = moduleTools.map((tool) => tool.name)
    expect(names).toEqual(
      expect.arrayContaining(["notes_list_notes", "notes_show_notes", "notes_list_data"]),
    )
    expect(names.some((name) => name.startsWith("camunda7_"))).toBe(true)
    expect(names.some((name) => name.startsWith("analytics_"))).toBe(true)
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
      const result = await client.callTool({ name: tool.name, arguments: { [PROBE_KEY]: true } })
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
