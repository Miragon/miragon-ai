import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { MCPServer } from "mcp-use"
import { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { createInMemoryProfileStore } from "@miragon-ai/widget-shell/server"
import { DEFAULT_HEALTH_THRESHOLDS } from "../data/health-data.js"
import { createEngineRegistry, type EngineEntry } from "../lib/resolve-engine.js"
import { camunda7Module } from "../module.js"
import { providerForEntry } from "../providers/index.js"
import { CAMUNDA7_PROCESS_INSTANCES_DATA } from "../tool-names.js"
import { registerWidgetDataFeeds } from "../widget-tools/data-feeds.js"
import { registerProcessInstanceTools } from "./process-instances.js"

/**
 * Guard for #325, end to end: the text a MODEL reads when an engine call
 * fails. A real local HTTP server plays the engine; the tools run through
 * the real toolkit registrar (its `withToolErrors`), `withEngine`, the
 * generated SDK and the vendor provider's client — nothing is mocked. Before
 * the fix every one of these read "[object Object]" (or "fetch failed").
 */

type ToolCallback = (
  args: Record<string, unknown>,
  ctx?: unknown,
) => Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }>

const engine = http.createServer((req, res) => {
  const url = req.url ?? ""
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" })
    res.end(JSON.stringify(body))
  }
  if (url.includes("hang")) return // never answers
  if (url.startsWith("/engine-rest/process-instance/missing")) {
    return json(404, {
      type: "InvalidRequestException",
      message: "Process instance with id missing does not exist",
      code: 0,
    })
  }
  if (url.startsWith("/engine-rest/process-instance/bad-type")) {
    return json(400, {
      type: "InvalidRequestException",
      message: "Cannot convert value 'abc' to type Integer",
      code: 0,
    })
  }
  if (url.startsWith("/engine-rest/process-instance/empty")) {
    res.writeHead(500)
    return res.end()
  }
  if (url.startsWith("/engine-rest/process-instance/text")) {
    res.writeHead(503, { "Content-Type": "text/plain" })
    return res.end("Service Unavailable: engine is starting")
  }
  json(200, { id: "ok" })
})

let baseUrl = ""
let closedPortUrl = ""

beforeAll(async () => {
  await new Promise<void>((resolve) => engine.listen(0, "127.0.0.1", resolve))
  baseUrl = `http://127.0.0.1:${(engine.address() as AddressInfo).port}/engine-rest`
  const probe = http.createServer()
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve))
  const closedPort = (probe.address() as AddressInfo).port
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  closedPortUrl = `http://127.0.0.1:${closedPort}/engine-rest`
})

afterAll(async () => {
  engine.closeAllConnections()
  await new Promise<void>((resolve) => engine.close(() => resolve()))
})

/** A registry over real provider-built clients (the plugin's construction path). */
function registryFor(engines: EngineEntry[], timeoutMs = 200) {
  return createEngineRegistry(engines, (e) =>
    providerForEntry(e).createClient(e, { type: "none" }, { timeoutMs }),
  )
}

/** Captures `server.tool` callbacks instead of serving them. */
function fakeServer() {
  const tools = new Map<string, ToolCallback>()
  const server = {
    tool: (definition: { name: string }, callback: ToolCallback) => {
      tools.set(definition.name, callback)
    },
  } as unknown as MCPServer
  return { server, tools }
}

/** The model-facing text of a failing `camunda7_get_process_instance` call. */
async function getInstanceError(
  processInstanceId: string,
  engines: EngineEntry[],
  engine?: string,
) {
  const { server, tools } = fakeServer()
  registerProcessInstanceTools(createToolRegistrar(server, registryFor(engines)))
  const result = await tools.get("camunda7_get_process_instance")!({ processInstanceId, engine })
  expect(result.isError).toBe(true)
  return result.content[0].text
}

describe("engine errors as the model reads them (registrar tool)", () => {
  const prodA = () => [{ id: "prod-a", baseUrl }]

  it("404 ExceptionDto", async () => {
    expect(await getInstanceError("missing", prodA())).toBe(
      "[404 InvalidRequestException] Process instance with id missing does not exist (engine prod-a)",
    )
  })

  it("400 ExceptionDto", async () => {
    expect(await getInstanceError("bad-type", prodA())).toBe(
      "[400 InvalidRequestException] Cannot convert value 'abc' to type Integer (engine prod-a)",
    )
  })

  it("500 with an empty body", async () => {
    expect(await getInstanceError("empty", prodA())).toBe(
      "[500] Internal Server Error — empty response body (engine prod-a)",
    )
  })

  it("a text/plain body", async () => {
    expect(await getInstanceError("text", prodA())).toBe(
      "[503] Service Unavailable: engine is starting (engine prod-a)",
    )
  })

  it("ECONNREFUSED names the engine that is down", async () => {
    const fleet = [
      { id: "prod-a", baseUrl },
      { id: "prod-b", baseUrl: closedPortUrl },
    ]
    expect(await getInstanceError("x", fleet, "prod-b")).toBe(
      "engine prod-b unreachable (ECONNREFUSED)",
    )
  })

  it("a hung engine ends at the per-request deadline", async () => {
    expect(await getInstanceError("hang", prodA())).toBe(
      "engine prod-a did not respond within 200 ms (timeout)",
    )
  })

  it("CAMUNDA_REQUEST_TIMEOUT_MS reaches the clients the module boots", async () => {
    const { server, tools } = fakeServer()
    Object.assign(server, { use: () => {}, prompt: () => {} })
    const config = camunda7Module.configFromEnv({
      CAMUNDA_BASE_URL: baseUrl,
      CAMUNDA_ENGINE_ID: "prod-a",
      CAMUNDA_REQUEST_TIMEOUT_MS: "150",
    })
    camunda7Module.createPlugin({ ...config, toolset: "read-only" }, {}).registerTools?.(server)
    const result = await tools.get("camunda7_get_process_instance")!({ processInstanceId: "hang" })
    expect(result.content[0].text).toBe("engine prod-a did not respond within 150 ms (timeout)")
  })
})

describe("widget-path feeds honor the MCP request's ctx.signal", () => {
  it("a cancelled request aborts the engine read before the deadline", async () => {
    const { server, tools } = fakeServer()
    registerWidgetDataFeeds({
      server,
      registry: registryFor([{ id: "prod-a", baseUrl }], 10_000),
      healthThresholds: DEFAULT_HEALTH_THRESHOLDS,
      profileStore: createInMemoryProfileStore(),
      toolset: "read-only",
    })
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 30)
    const started = Date.now()
    const result = await tools.get(CAMUNDA7_PROCESS_INSTANCES_DATA)!(
      { processDefinitionKey: "hang" },
      { signal: controller.signal },
    )
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe("request to engine prod-a was cancelled by the caller")
  })
})
