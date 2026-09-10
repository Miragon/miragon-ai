import net from "node:net"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import type { MCPServer } from "mcp-use"
import { installHealthEndpoints, installMetrics } from "@miragon-ai/widget-shell/server"
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

/**
 * The operational routes `src/index.ts` mounts next to `/mcp`: the probes a
 * Kubernetes deployment (or the Dockerfile HEALTHCHECK) polls and the
 * Prometheus scrape. Boots the real server so the routes are exercised on the
 * wire, outside the MCP transport.
 */
describe("operational HTTP routes (health + metrics)", () => {
  let app: MCPServer
  let base: string

  beforeAll(async () => {
    vi.stubEnv("CAMUNDA_BASE_URL", "http://localhost:1")
    vi.stubEnv("CAMUNDA_ENGINES_FILE", undefined)
    vi.stubEnv("CAMUNDA_ENGINES_JSON", undefined)
    vi.stubEnv("MCP_ACTIVE_MODULES", undefined)
    vi.stubEnv("MCP_PROFILE_DIR", undefined)
    vi.stubEnv("MCP_DASHBOARD_DIR", undefined)

    app = await createFrameworkApp({
      name: "acme-mcp",
      version: "0.1.0",
      host: "127.0.0.1",
      plugins: getPlugins() as AppPlugin[],
      appConfig: getAppConfig(),
      app: { bundle: { jsPath: FIXTURE_JS } },
    })
    // Same order as src/index.ts: metrics first so the probes are counted.
    installMetrics(app)
    installHealthEndpoints(app, { readiness: { always: () => {} }, label: "acme-mcp" })
    const port = await getFreePort()
    await app.listen(port)
    base = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    await app?.close()
    vi.unstubAllEnvs()
  })

  it("answers the liveness and readiness probes", async () => {
    const live = await fetch(`${base}/health/live`)
    expect(live.status).toBe(200)
    expect(await live.json()).toEqual({ status: "up" })

    const ready = await fetch(`${base}/health/ready`)
    expect(ready.status).toBe(200)
    expect(await ready.json()).toEqual({ status: "up", checks: { always: "up" } })
  })

  it("serves Prometheus text that counts the probe traffic", async () => {
    await fetch(`${base}/health/live`)
    const metrics = await fetch(`${base}/metrics`)
    expect(metrics.status).toBe(200)
    expect(metrics.headers.get("content-type")).toContain("text/plain")
    const text = await metrics.text()
    expect(text).toMatch(
      /^mcp_http_requests_total\{method="GET",route="\/health",status="200"\} [1-9]\d*$/m,
    )
    expect(text).toContain("# HELP mcp_tool_calls_total")
    expect(text).toContain("process_cpu_user_seconds_total")
  })
})
