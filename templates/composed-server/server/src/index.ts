#!/usr/bin/env node

import path from "node:path"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import type { MCPServer } from "mcp-use"
import { installMcpRequestContext } from "@miragon-ai/widget-shell/server"
import { createDashboardStore, createProfileStore, startSessionCleanup } from "./persistence.js"
import { emitBootWarnings, getAppConfig, getPlugins, warnUnknownEnvVars } from "./setup.js"

// mcp-use ships anonymized telemetry (PostHog + Scarf) enabled by default —
// an ops server must not phone home unless explicitly opted in.
process.env.MCP_USE_ANONYMIZED_TELEMETRY ??= "false"

// Surface env-var typos at boot instead of silently ignoring them.
warnUnknownEnvVars()
emitBootWarnings()

const profileStore = createProfileStore()
startSessionCleanup(profileStore)

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "..", "dist")
  : import.meta.dirname

// Explicit annotation: default-exporting the instance makes its type public
// API, and the inferred type reaches into hono internals TS cannot name
// portably (TS2742). `unknown` user slot = createFrameworkApp's return shape.
const app: MCPServer<unknown> = await createFrameworkApp({
  name: "acme-mcp",
  version: "0.1.0",
  host: "0.0.0.0",
  // No baseUrl since mcp-use 2: the serving origin is resolved per request
  // (or from MCP_URL, which mcp-use reads itself for offline derivations).
  // Cast: toolkit's `plugins: AppPlugin[]` is unparameterized (TServer = unknown),
  // but our plugin factories return `AppPlugin<MCPServer>`. The framework invokes
  // `registerTools(MCPServer)` at runtime, so the narrowing is sound.
  plugins: getPlugins(profileStore) as AppPlugin[],
  appConfig: getAppConfig(),
  app: {
    // The compiled widget bundle (ES module + stylesheet — the mcp-use 2
    // native-view shape; the 1.x single-file HTML is gone). Read ONCE at
    // boot: after rebuilding the bundle, restart the host.
    bundle: {
      jsPath: path.join(DIST_DIR, "mcp-app.js"),
      cssPath: path.join(DIST_DIR, "mcp-app.css"),
    },
    // Visual builder + dashboard-persistence tools (get-builder-catalogue,
    // save/load/list/delete-dashboard) — opt-in since toolkit 0.4.0.
    builder: true,
    dashboardStore: createDashboardStore(),
  },
})

// Ambient per-request info (session id, auth user, Authorization header) for
// the consumers that cannot receive a handler `ctx` — most notably the
// profile-key resolution in registrar handlers. Idempotent — the
// camunda7/analytics plugins install it too.
installMcpRequestContext(app)

// --- Tool-call logging -------------------------------------------------
// One log line per tools/call with tool name, duration, and outcome.
// Arguments and results are deliberately not logged — they can carry
// credentials or PII (e.g. process variables).
//
// mcp-use 2 delivers the tool name on `ctx.params.name` and fires this
// middleware once per call (batch entries individually) — the 1.x HTTP-layer
// name capture is gone with the problem it worked around.
app.use("mcp:tools/call", async (ctx, next) => {
  const toolName = (ctx.params as { name?: string } | undefined)?.name ?? "unknown"
  const start = Date.now()
  try {
    const result = await next()
    const isError =
      typeof result === "object" &&
      result !== null &&
      (result as { isError?: unknown }).isError === true
    console.log(
      `[acme-mcp] tools/call ${toolName} ${isError ? "error" : "ok"} in ${Date.now() - start}ms`,
    )
    return result
  } catch (error) {
    console.log(`[acme-mcp] tools/call ${toolName} error in ${Date.now() - start}ms`)
    throw error
  }
})

// `mcp-use dev` (the dev CLI since mcp-use 2) imports this entry, takes the
// default-exported server, and owns the socket + process lifecycle itself —
// it sets MCP_USE_DEV_CLI before loading the entry and rejects an entry
// without a default export. Self-serving below stays for production
// (`node dist/index.js`) and direct `node src/index.ts` runs.
if (process.env.MCP_USE_DEV_CLI) {
  // The dev CLI also unconditionally primes its own views manifest (built
  // from the optional `views/` directory — EMPTY in this template, which
  // bundles views itself) onto the entry's export, and mcp-use rejects a
  // second prime after createFrameworkApp already primed the registry from
  // `app.bundle`. Swallow the CLI's empty prime — the bundle prime is the
  // complete one. Scoped to the dev CLI so a genuine double-prime still
  // fails loudly.
  ;(app as unknown as { __primeViews: () => void }).__primeViews = () => {}
}

export default app

if (!process.env.MCP_USE_DEV_CLI) {
  // `||` (not `??`): an empty `PORT=` assignment from an env_file must fall back
  // to 8400 — `Number("")` is 0, which would bind a random OS-assigned port.
  const port = Number(process.env.PORT?.trim() || 8400)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`[acme-mcp] invalid PORT "${process.env.PORT}" — expected an integer 1-65535`)
  }

  await app.listen(port)
}
