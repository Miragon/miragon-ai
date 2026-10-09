import http from "node:http"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { RunningServer } from "@miragon-ai/widget-shell/server"
import { createApp } from "../src/app.js"

const FIXTURE_JS = path.join(import.meta.dirname, "fixtures", "mcp-app.js")

/** Raw HTTP on a fresh connection — `fetch` cannot set a `Host` header. */
function request(
  port: number,
  {
    body,
    ...options
  }: { method?: string; path: string; headers?: Record<string, string | number>; body?: string },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, agent: false, method: "GET", ...options },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk: Buffer) => chunks.push(chunk))
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
        )
      },
    )
    req.on("error", reject)
    req.end(body)
  })
}

/**
 * The HTTP surface `src/index.ts` serves next to `/mcp`, booted through the
 * real `createApp`: the probes a Kubernetes deployment (or the Dockerfile
 * HEALTHCHECK) polls, the Prometheus scrape, and the shared edge — the
 * Host/Origin guard (DNS-rebinding protection) and the request-body cap.
 */
describe("HTTP surface (createApp)", () => {
  let server: RunningServer
  let base: string

  beforeAll(async () => {
    vi.stubEnv("CAMUNDA_BASE_URL", "http://localhost:1")
    vi.stubEnv("CAMUNDA_ENGINES_FILE", undefined)
    vi.stubEnv("CAMUNDA_ENGINES_JSON", undefined)
    vi.stubEnv("MCP_ACTIVE_MODULES", undefined)
    vi.stubEnv("MCP_PROFILE_DIR", undefined)
    vi.stubEnv("MCP_DASHBOARD_DIR", undefined)
    vi.stubEnv("MCP_URL", undefined)
    vi.stubEnv("MCP_ALLOWED_HOSTS", undefined)
    vi.stubEnv("MCP_ALLOWED_ORIGINS", undefined)
    vi.stubEnv("MCP_MAX_BODY_BYTES", undefined)
    vi.stubEnv("MCP_METRICS_TOKEN", undefined)

    const composed = await createApp(process.env, { bundle: { jsPath: FIXTURE_JS } })
    server = await composed.listen({ port: 0, host: "127.0.0.1" })
    base = `http://127.0.0.1:${server.port}`
  })

  afterAll(async () => {
    await server?.shutdown()
    vi.unstubAllEnvs()
  })

  it("answers the liveness and readiness probes", async () => {
    const live = await fetch(`${base}/health/live`)
    expect(live.status).toBe(200)
    expect(await live.json()).toEqual({ status: "up" })

    const ready = await fetch(`${base}/health/ready`)
    expect(ready.status).toBe(200)
    expect(await ready.json()).toEqual({ status: "up", checks: {} })
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

  it("refuses a foreign Host on /mcp (DNS-rebinding protection) but not on the probes", async () => {
    const mcp = await request(server.port, {
      method: "POST",
      path: "/mcp",
      headers: { host: "attacker.example", "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    })
    expect(mcp.status).toBe(403)
    expect(mcp.body).toContain("MCP_ALLOWED_HOSTS")
    const probe = await request(server.port, {
      path: "/health/ready",
      headers: { host: "10.0.0.7:8400" },
    })
    expect(probe.status).toBe(200)
  })

  it("answers 413 for a body over the 4 MiB default before reading it", async () => {
    const res = await request(server.port, {
      method: "POST",
      path: "/mcp",
      headers: { "content-type": "application/json", "content-length": 5 * 1024 * 1024 },
    })
    expect(res.status).toBe(413)
  })
})

/**
 * `mcp-use dev --tunnel` (the setup-server skill's way to try a local build
 * from claude.ai or ChatGPT): the CLI owns the socket, checks `Host` itself —
 * localhost-class plus its own tunnel host — and hands `createApp`'s server
 * the tunneled request with the PUBLIC tunnel host unchanged. The app's guard
 * must defer that half to the CLI or every hosted-assistant call gets 403.
 */
describe("under `mcp-use dev --tunnel`", () => {
  const TUNNEL_HOST = "k3x9.tunnel.example"

  it("serves the tunnel host and still refuses a foreign Origin", async () => {
    const composed = await createApp(
      { CAMUNDA_BASE_URL: "http://localhost:1", MCP_USE_DEV_CLI: "1" },
      { bundle: { jsPath: FIXTURE_JS } },
    )
    const tunneled = (headers: Record<string, string> = {}) =>
      composed.app.fetch(
        new Request(`http://${TUNNEL_HOST}/mcp`, {
          method: "POST",
          headers: {
            host: TUNNEL_HOST,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            ...headers,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-06-18",
              capabilities: {},
              clientInfo: { name: "tunnel-test", version: "0" },
            },
          }),
        }),
      )
    expect((await tunneled()).status).toBe(200)
    expect((await tunneled({ origin: "https://attacker.example" })).status).toBe(403)
  })
})
