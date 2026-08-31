import net from "node:net"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import type { MCPServer } from "mcp-use"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { getAppConfig, getPlugins } from "../src/setup.js"
import { EXPECTED_TOOLS } from "./expected-tools.js"

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

/** Modern-envelope MCP client against the in-process server (mcp-use 2 wire). */
async function connectClient(port: number): Promise<Client> {
  const client = new Client({ name: "e2e-test", version: "0.0.0" })
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)))
  return client
}

function textPayload(result: { content?: unknown }): unknown {
  const content = result.content as Array<{ type: string; text?: string }> | undefined
  const text = content?.find((c) => c.type === "text")?.text
  expect(text, "tool result should carry a text content block").toBeTruthy()
  return JSON.parse(text!)
}

/**
 * E2E smoke test: boots the real server in-process (same plugin set and env
 * wiring as `src/index.ts`, with a stand-in widget bundle) and speaks the MCP
 * protocol to it over streamable HTTP. This is the only test that covers tool
 * *registration* — plugin.ts wiring, setup.ts module activation and the
 * framework tool trio — rather than the tool implementations.
 */
describe("mcp-server-camunda7 E2E smoke", () => {
  let app: MCPServer
  let client: Client

  beforeAll(async () => {
    // Dummy engine: tools that only hit the in-memory EngineRegistry keep
    // working; nothing in this test may reach a real engine or Prometheus.
    vi.stubEnv("CAMUNDA_BASE_URL", "http://localhost:1")
    vi.stubEnv("CAMUNDA_ENGINES_FILE", undefined)
    vi.stubEnv("CAMUNDA_ENGINES_JSON", undefined)
    vi.stubEnv("CAMUNDA_COCKPIT_URL", undefined)
    vi.stubEnv("MCP_ACTIVE_MODULES", undefined)
    // Persistence must stay in-memory regardless of the dev shell's env.
    vi.stubEnv("DATABASE_URL", undefined)
    vi.stubEnv("REDIS_URL", undefined)
    vi.stubEnv("MCP_PROFILE_DIR", undefined)
    vi.stubEnv("MCP_DASHBOARD_DIR", undefined)

    app = await createFrameworkApp({
      name: "automation-mcp",
      version: "0.1.0",
      host: "127.0.0.1",
      plugins: getPlugins() as AppPlugin[],
      appConfig: getAppConfig(),
      app: {
        bundle: { jsPath: FIXTURE_JS },
        // Match src/index.ts: keep the opt-in builder/dashboard tools registered
        // so the EXPECTED_TOOLS snapshot covers the full surface.
        builder: true,
      },
    })
    const port = await getFreePort()
    await app.listen(port)
    client = await connectClient(port)
  })

  afterAll(async () => {
    await client?.close()
    await app?.close()
    vi.unstubAllEnvs()
  })

  it("exposes exactly the expected tool surface (tools/list snapshot)", async () => {
    const { tools } = await client.listTools()
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
    const { tools } = await client.listTools()
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
    const result = await client.callTool({
      name: "camunda7_engine",
      arguments: { action: "list" },
    })
    expect(result.isError).toBeFalsy()
    expect(textPayload(result)).toEqual({
      engines: [
        {
          id: "default",
          baseUrl: "http://localhost:1",
          environment: "default",
          flavor: "cibseven",
          engineName: "CIB Seven",
        },
      ],
      environments: [{ id: "default", engineIds: ["default"] }],
      defaultEngineId: null,
    })
  })

  it("answers get-framework-manifest with the active modules", async () => {
    const result = await client.callTool({ name: "get-framework-manifest", arguments: {} })
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
  let app: MCPServer
  let client: Client

  beforeAll(async () => {
    vi.stubEnv("CAMUNDA_BASE_URL", "http://localhost:1")
    vi.stubEnv("CAMUNDA_ENGINES_FILE", undefined)
    vi.stubEnv("CAMUNDA_ENGINES_JSON", undefined)
    vi.stubEnv("CAMUNDA_COCKPIT_URL", undefined)
    vi.stubEnv("MCP_ACTIVE_MODULES", "camunda7:read-only")
    // Persistence must stay in-memory regardless of the dev shell's env.
    vi.stubEnv("DATABASE_URL", undefined)
    vi.stubEnv("REDIS_URL", undefined)
    vi.stubEnv("MCP_PROFILE_DIR", undefined)
    vi.stubEnv("MCP_DASHBOARD_DIR", undefined)

    app = await createFrameworkApp({
      name: "automation-mcp",
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
    client = await connectClient(port)
  })

  afterAll(async () => {
    await client?.close()
    await app?.close()
    vi.unstubAllEnvs()
  })

  it("advertises no destructive or engine-write tools, but keeps queries + engine selection", async () => {
    const { tools } = await client.listTools()
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
