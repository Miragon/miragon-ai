import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { MCPServer } from "mcp-use"
import { createEngineRegistry } from "../lib/resolve-engine.js"
import { providerForEntry } from "../providers/index.js"
import { CAMUNDA7_OPEN_COCKPIT, CAMUNDA7_WIDGET_ACTIONS_DATA } from "../tool-names.js"
import { registerWidgetTools } from "../widget-tools.js"

/**
 * Structural guard for #325: EVERY widget-path tool and `*_data` feed hands
 * the MCP request's `ctx` to `resolveEngine`, so a cancelled request aborts
 * its engine reads. Dropping it compiles (`call` is optional) and the
 * per-feed tests stay green — only a sweep over the whole surface notices.
 *
 * Each handler runs twice against a recording fake engine: unsignalled it
 * must reach the engine; with an already-aborted `ctx.signal` it must not
 * (an aborted read fails before the network, also where a builder swallows
 * the failure). Tools that never read the engine are named explicitly.
 */

type ToolCallback = (args: Record<string, unknown>, ctx?: unknown) => Promise<unknown>

let requests = 0
const engine = http.createServer((req, res) => {
  requests++
  res.writeHead(200, { "Content-Type": "application/json" })
  res.end(req.url?.includes("/count") ? '{"count":0}' : "[]")
})

let baseUrl = ""

beforeAll(async () => {
  await new Promise<void>((resolve) => engine.listen(0, "127.0.0.1", resolve))
  baseUrl = `http://127.0.0.1:${(engine.address() as AddressInfo).port}/engine-rest`
})

afterAll(async () => {
  engine.closeAllConnections()
  await new Promise<void>((resolve) => engine.close(() => resolve()))
})

/** Arguments every widget tool accepts (each takes the fields it knows). */
const ARGS = {
  processDefinitionKey: "order",
  processDefinitionId: "order:1:abc",
  processInstanceId: "pi-1",
  incidentId: "inc-1",
  activityId: "task-1",
}

describe("widget tools and feeds honor ctx.signal", () => {
  it("every engine-reading handler stops reading once the MCP request is cancelled", async () => {
    const tools = new Map<string, ToolCallback>()
    const server = {
      tool: (definition: { name: string }, callback: ToolCallback) => {
        tools.set(definition.name, callback)
      },
    } as unknown as MCPServer
    const registry = createEngineRegistry([{ id: "prod-a", baseUrl }], (e) =>
      providerForEntry(e).createClient(e, { type: "none" }, { timeoutMs: 2000 }),
    )
    registerWidgetTools(server, registry, { toolset: "read-only" })

    const readsOf = async (name: string, ctx: { signal?: AbortSignal }) => {
      const before = requests
      await tools.get(name)!(ARGS, ctx)
      return requests - before
    }
    const neverRead: string[] = []
    for (const name of tools.keys()) {
      if ((await readsOf(name, {})) === 0) {
        neverRead.push(name)
        continue
      }
      expect({ name, reads: await readsOf(name, { signal: AbortSignal.abort() }) }).toEqual({
        name,
        reads: 0,
      })
    }
    // The cockpit bootstrap only resolves the engine id; the actions feed
    // answers from the toolset.
    expect(neverRead).toEqual([CAMUNDA7_OPEN_COCKPIT, CAMUNDA7_WIDGET_ACTIONS_DATA])
    expect(tools.size - neverRead.length).toBeGreaterThanOrEqual(24)
  })
})
