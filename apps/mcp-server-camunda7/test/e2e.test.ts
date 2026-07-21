import net from "node:net"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { MCPClient, type MCPSession } from "mcp-use/client"
import type { McpServerInstance } from "mcp-use/server"
import { getAppConfig, getPlugins } from "../src/setup.js"
import { EXPECTED_TOOLS } from "./expected-tools.js"

const FIXTURE_HTML = path.join(import.meta.dirname, "fixtures", "mcp-app.html")

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

function textPayload(result: { content?: unknown }): unknown {
  const content = result.content as Array<{ type: string; text?: string }> | undefined
  const text = content?.find((c) => c.type === "text")?.text
  expect(text, "tool result should carry a text content block").toBeTruthy()
  return JSON.parse(text!)
}

/**
 * E2E smoke test: boots the real server server in-process (same plugin set
 * and env wiring as `src/index.ts`, minus the built UI bundle) and speaks the
 * MCP protocol to it over streamable HTTP. This is the only test that covers
 * tool *registration* — plugin.ts wiring, setup.ts module activation and the
 * framework tool trio — rather than the tool implementations.
 */
describe("mcp-server-camunda7 E2E smoke", () => {
  let app: McpServerInstance<false>
  let client: MCPClient
  let session: MCPSession

  beforeAll(async () => {
    // Dummy engine: tools that only hit the in-memory EngineRegistry keep
    // working; nothing in this test may reach a real engine or Prometheus.
    vi.stubEnv("CAMUNDA_BASE_URL", "http://localhost:1")
    vi.stubEnv("CAMUNDA_ENGINES_FILE", undefined)
    vi.stubEnv("CAMUNDA_ENGINES_JSON", undefined)
    vi.stubEnv("CAMUNDA_COCKPIT_URL", undefined)
    vi.stubEnv("MCP_ACTIVE_MODULES", undefined)

    app = await createFrameworkApp({
      name: "automation-mcp",
      version: "0.1.0",
      host: "127.0.0.1",
      plugins: getPlugins() as AppPlugin[],
      appConfig: getAppConfig(),
      app: {
        resourceUri: "ui://automation-mcp/mcp-app.e2e.html",
        htmlPath: FIXTURE_HTML,
        // Match src/index.ts: keep the opt-in builder/dashboard tools registered
        // so the EXPECTED_TOOLS snapshot covers the full surface.
        builder: true,
      },
    })
    const port = await getFreePort()
    await app.listen(port)

    client = MCPClient.fromDict({
      mcpServers: { server: { url: `http://127.0.0.1:${port}/mcp` } },
    })
    session = await client.createSession("server")
  })

  afterAll(async () => {
    await client?.closeAllSessions()
    await app?.close()
    vi.unstubAllEnvs()
  })

  it("exposes exactly the expected tool surface (tools/list snapshot)", async () => {
    const tools = await session.listTools()
    const names = tools.map((t) => t.name).sort()
    expect(names).toEqual([...EXPECTED_TOOLS])
  })

  it("advertises the pagination envelope on every list/query tool", async () => {
    const paginatedTools = [
      "camunda7_list_process_instances",
      "camunda7_list_tasks",
      "camunda7_list_jobs",
      "camunda7_list_incidents",
      "camunda7_query_historic_process_instances",
      "camunda7_query_historic_activity_instances",
      "camunda7_query_historic_task_instances",
      "camunda7_query_historic_variable_instances",
    ]
    const tools = await session.listTools()
    for (const name of paginatedTools) {
      const tool = tools.find((t) => t.name === name)
      expect(tool, `${name} should be exposed`).toBeDefined()
      const outputProps = (tool!.outputSchema as { properties?: Record<string, unknown> } | null)
        ?.properties
      expect(outputProps, `${name} should advertise an outputSchema`).toBeTruthy()
      expect(Object.keys(outputProps!)).toEqual(
        expect.arrayContaining(["items", "totalCount", "hasMore", "nextOffset"]),
      )
      const inputProps = (tool!.inputSchema as { properties?: Record<string, unknown> })?.properties
      expect(inputProps, `${name} should accept firstResult`).toHaveProperty("firstResult")
    }
  })

  it("answers camunda7_engine (action list) from the engine registry without a live engine", async () => {
    const result = await session.callTool("camunda7_engine", { action: "list" })
    expect(result.isError).toBeFalsy()
    expect(textPayload(result)).toEqual({
      engines: [
        {
          id: "default",
          baseUrl: "http://localhost:1",
          flavor: "cibseven",
          engineName: "CIB Seven",
        },
      ],
      currentSelection: null,
      profileDefaultEngineId: null,
    })
  })

  it("answers get-framework-manifest with the active modules", async () => {
    const result = await session.callTool("get-framework-manifest", {})
    expect(result.isError).toBeFalsy()
    const manifest = JSON.stringify(textPayload(result))
    expect(manifest).toContain("camunda7")
    expect(manifest).toContain("analytics")
  })
})

/**
 * Toolset negative probe: a `camunda7:read-only` deployment must not advertise
 * any destructive or engine-write tool. Boots a second server instance so the
 * env-driven `module:toolset` wiring (setup.ts → plugin config → registrar
 * filter) is covered end to end, not just the filter in isolation.
 */
describe("mcp-server-camunda7 E2E toolset filtering (camunda7:read-only)", () => {
  let app: McpServerInstance<false>
  let client: MCPClient
  let session: MCPSession

  beforeAll(async () => {
    vi.stubEnv("CAMUNDA_BASE_URL", "http://localhost:1")
    vi.stubEnv("CAMUNDA_ENGINES_FILE", undefined)
    vi.stubEnv("CAMUNDA_ENGINES_JSON", undefined)
    vi.stubEnv("CAMUNDA_COCKPIT_URL", undefined)
    vi.stubEnv("MCP_ACTIVE_MODULES", "camunda7:read-only")

    app = await createFrameworkApp({
      name: "automation-mcp",
      version: "0.1.0",
      host: "127.0.0.1",
      plugins: getPlugins() as AppPlugin[],
      appConfig: getAppConfig(),
      app: {
        resourceUri: "ui://automation-mcp/mcp-app.e2e-read-only.html",
        htmlPath: FIXTURE_HTML,
        builder: true,
      },
    })
    const port = await getFreePort()
    await app.listen(port)

    client = MCPClient.fromDict({
      mcpServers: { server: { url: `http://127.0.0.1:${port}/mcp` } },
    })
    session = await client.createSession("server")
  })

  afterAll(async () => {
    await client?.closeAllSessions()
    await app?.close()
    vi.unstubAllEnvs()
  })

  it("advertises no destructive or engine-write tools, but keeps queries + engine selection", async () => {
    const tools = await session.listTools()
    const names = tools.map((t) => t.name)

    const forbidden = [
      // admin-only (destructive / engine-content-changing)
      "camunda7_delete_process_instance",
      "camunda7_modify_process_instance",
      "camunda7_set_process_instance_suspension",
      "camunda7_create_deployment",
      "camunda7_create_migration_plan",
      "camunda7_migrate_process_instances_async",
      "camunda7_set_job_retries_batch",
      // engine writes (operations toolset only)
      "camunda7_start_process_instance",
      "camunda7_complete_task",
      "camunda7_claim_task",
      "camunda7_set_job_retries",
      "camunda7_correlate_message",
      "camunda7_throw_signal",
      // durable profile write (registered via the widget-tools path, not the registrar)
      "camunda7_save_user_profile",
    ]
    for (const tool of forbidden) {
      expect(names, `${tool} must not be advertised in camunda7:read-only`).not.toContain(tool)
    }

    expect(names).toEqual(
      expect.arrayContaining([
        "camunda7_engine",
        "camunda7_list_process_instances",
        "camunda7_list_incidents",
        "camunda7_query_historic_process_instances",
      ]),
    )
    // The analytics module was not activated alongside.
    expect(names.some((n) => n.startsWith("analytics_"))).toBe(false)
  })
})
