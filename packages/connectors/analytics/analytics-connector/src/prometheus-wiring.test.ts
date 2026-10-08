import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { MCPServer } from "mcp-use"
import { analyticsModule } from "./module.js"
import { ANALYTICS_ENGINE_LANDSCAPE_DATA } from "./tool-names.js"

/**
 * #325 through the module: env → config → plugin → Prometheus client → tool.
 * A real local HTTP server plays Prometheus, so the auth headers, the
 * deadline and the caller's cancellation are observed on the wire.
 */

type ToolCallback = (
  args: Record<string, unknown>,
  ctx?: unknown,
) => Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }>

const seenAuth: Array<string | undefined> = []
let hang = false

const prometheus = http.createServer((req, res) => {
  seenAuth.push(req.headers.authorization)
  if (hang) return
  res.writeHead(200, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ status: "success", data: { resultType: "vector", result: [] } }))
})

let url = ""

beforeAll(async () => {
  await new Promise<void>((resolve) => prometheus.listen(0, "127.0.0.1", resolve))
  url = `http://127.0.0.1:${(prometheus.address() as AddressInfo).port}`
})

afterAll(async () => {
  prometheus.closeAllConnections()
  await new Promise<void>((resolve) => prometheus.close(() => resolve()))
})

/** Boots the module from env the way the composition root does; returns its tools. */
function boot(env: NodeJS.ProcessEnv) {
  const tools = new Map<string, ToolCallback>()
  const server = {
    tool: (definition: { name: string }, callback: ToolCallback) => {
      tools.set(definition.name, callback)
    },
    use: () => {},
  } as unknown as MCPServer
  const plugin = analyticsModule.createPlugin(
    { ...analyticsModule.configFromEnv({ PROMETHEUS_URL: url, ...env }), toolset: "read-only" },
    {},
  )
  plugin.registerTools?.(server)
  plugin.registerWidgetTools?.(server)
  return tools
}

describe("Prometheus config reaches the wire", () => {
  it("PROMETHEUS_BEARER_TOKEN authenticates every query of a registrar tool", async () => {
    hang = false
    seenAuth.length = 0
    const tools = boot({ PROMETHEUS_BEARER_TOKEN: "tok-123" })
    const result = await tools.get("analytics_engine_landscape")!({})
    expect(result.isError).toBeFalsy()
    expect(seenAuth.length).toBeGreaterThan(0)
    expect(seenAuth.every((auth) => auth === "Bearer tok-123")).toBe(true)
  })

  it("PROMETHEUS_TIMEOUT_MS bounds a hung Prometheus", async () => {
    hang = true
    const tools = boot({ PROMETHEUS_TIMEOUT_MS: "60" })
    const result = await tools.get("analytics_engine_landscape")!({})
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe("Prometheus did not respond within 60 ms (timeout)")
  })

  it("a widget feed's ctx.signal cancels its queries before the deadline", async () => {
    hang = true
    const tools = boot({ PROMETHEUS_TIMEOUT_MS: "10000" })
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 30)
    const started = Date.now()
    const result = await tools.get(ANALYTICS_ENGINE_LANDSCAPE_DATA)!(
      {},
      { signal: controller.signal },
    )
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe("Prometheus query cancelled by the caller")
  })
})
