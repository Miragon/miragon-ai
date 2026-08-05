#!/usr/bin/env node

import path from "node:path"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp, installToolCallNameCapture } from "@miragon/mcp-toolkit-core/tools"
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

const HTML_PATH = path.join(DIST_DIR, "mcp-app.html")

const app = await createFrameworkApp({
  name: "acme-mcp",
  version: "0.1.0",
  host: "0.0.0.0",
  baseUrl: process.env.MCP_URL,
  // Cast: toolkit's `plugins: AppPlugin[]` is unparameterized (TServer = unknown),
  // but our plugin factories return `AppPlugin<MCPServer>`. The framework invokes
  // `registerTools(MCPServer)` at runtime, so the narrowing is sound.
  plugins: getPlugins(profileStore) as AppPlugin[],
  appConfig: getAppConfig(),
  app: {
    // resourceUri omitted: createFrameworkApp content-hashes htmlPath into a
    // cache-busting ui://acme-mcp/mcp-app.<hash>.html (with a stable dev
    // fallback when the bundle isn't built yet).
    htmlPath: HTML_PATH,
    // Visual builder + dashboard-persistence tools (get-builder-catalogue,
    // save/load/list/delete-dashboard) — opt-in since toolkit 0.4.0.
    builder: true,
    dashboardStore: createDashboardStore(),
  },
})

// --- Tool-call logging -------------------------------------------------
// One log line per tools/call with tool name, duration, and outcome.
// Arguments and results are deliberately not logged — they can carry
// credentials or PII (e.g. process variables).
const resolveToolName = installToolCallNameCapture(app)

app.use("mcp:tools/call", async (_ctx, next) => {
  const toolName = resolveToolName() ?? "unknown"
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

// `||` (not `??`): an empty `PORT=` assignment from an env_file must fall back
// to 8400 — `Number("")` is 0, which would bind a random OS-assigned port.
const port = Number(process.env.PORT?.trim() || 8400)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`[acme-mcp] invalid PORT "${process.env.PORT}" — expected an integer 1-65535`)
}

await app.listen(port)
