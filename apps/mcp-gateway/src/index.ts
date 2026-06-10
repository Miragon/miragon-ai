#!/usr/bin/env node

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { parseProxyConfigEnv } from "@miragon/mcp-toolkit-proxy-contract"
import { getRequestContext } from "mcp-use/server"
import { getAppConfig, getPlugins } from "./setup.js"

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "..", "dist")
  : import.meta.dirname

const HTML_PATH = path.join(DIST_DIR, "mcp-app.html")

// Content-hash the widget resource URI so each build yields a distinct URI.
// MCP hosts cache the widget bundle by its resource URI; with a fixed URI a
// host keeps serving a stale bundle even across server restarts. A per-build
// hash forces a fresh fetch whenever the bundle actually changes.
let bundleHash = "dev"
try {
  bundleHash = createHash("sha256").update(readFileSync(HTML_PATH)).digest("hex").slice(0, 10)
} catch {
  // dist not built yet — fall back to a stable dev URI
}

const app = await createFrameworkApp({
  name: "automation-mcp",
  version: "0.1.0",
  host: "0.0.0.0",
  baseUrl: process.env.MCP_URL,
  // Upstream proxies with `auth.mode: "oauth2"` mount their OAuth callback
  // routes on this server, so the public base URL doubles as the callback
  // base. When MCP_URL is unset and such a proxy is configured, the toolkit
  // still fails fast with its "callbackBaseUrl is required" error.
  callbackBaseUrl: process.env.MCP_URL,
  // Cast: toolkit's `plugins: AppPlugin[]` is unparameterized (TServer = unknown),
  // but our plugin factories return `AppPlugin<MCPServer>`. The framework invokes
  // `registerTools(MCPServer)` at runtime, so the narrowing is sound.
  plugins: getPlugins() as AppPlugin[],
  proxies: parseProxyConfigEnv(process.env.MCP_PROXIES),
  appConfig: getAppConfig(),
  app: {
    resourceUri: `ui://automation-mcp/mcp-app.${bundleHash}.html`,
    htmlPath: HTML_PATH,
  },
})

// --- Tool-call logging -------------------------------------------------
// One log line per tools/call with tool name, duration, and outcome.
// Arguments and results are deliberately not logged — they can carry
// credentials or PII (e.g. process variables).
//
// mcp-use 1.28 passes only the tool *arguments* as `ctx.params` to
// `mcp:tools/call` middleware; the `params.name` its typings declare is never
// populated at runtime. Recover the name from the JSON-RPC envelope at the
// HTTP layer (cloning keeps the body readable for the MCP transport) and hand
// it to the MCP middleware keyed by the request-scoped Hono context, which
// `getRequestContext()` returns inside the MCP middleware chain.
const toolNameByRequest = new WeakMap<object, string>()

app.use(async (c, next) => {
  if (c.req.method === "POST" && c.req.path === "/mcp") {
    const body: unknown = await c.req.raw
      .clone()
      .json()
      .catch(() => undefined)
    if (typeof body === "object" && body !== null) {
      const { method, params } = body as { method?: unknown; params?: { name?: unknown } }
      if (method === "tools/call" && typeof params?.name === "string") {
        toolNameByRequest.set(c, params.name)
      }
    }
  }
  await next()
})

app.use("mcp:tools/call", async (_ctx, next) => {
  const requestContext = getRequestContext()
  const toolName = (requestContext && toolNameByRequest.get(requestContext)) ?? "unknown"
  const start = Date.now()
  try {
    const result = await next()
    const isError =
      typeof result === "object" &&
      result !== null &&
      (result as { isError?: unknown }).isError === true
    console.log(
      `[automation-mcp] tools/call ${toolName} ${isError ? "error" : "ok"} in ${Date.now() - start}ms`,
    )
    return result
  } catch (error) {
    console.log(`[automation-mcp] tools/call ${toolName} error in ${Date.now() - start}ms`)
    throw error
  }
})

await app.listen(Number(process.env.PORT ?? 8400))
