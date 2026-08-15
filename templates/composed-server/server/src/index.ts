#!/usr/bin/env node

import path from "node:path"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import type { MCPServer } from "mcp-use"
import {
  installMcpRequestContext,
  installToolCallLogging,
  resolvePort,
  swallowDevCliViewsPrime,
} from "@miragon-ai/widget-shell/server"
import {
  createDashboardStore,
  createProfileStore,
  emitBootWarnings,
  getAppConfig,
  getPlugins,
  startSessionCleanup,
  warnUnknownEnvVars,
} from "./setup.js"

// mcp-use ships anonymized telemetry enabled by default — an ops server must
// not phone home unless explicitly opted in.
process.env.MCP_USE_ANONYMIZED_TELEMETRY ??= "false"

// Surface env-var typos at boot instead of silently ignoring them.
warnUnknownEnvVars()
emitBootWarnings()

const profileStore = createProfileStore()
startSessionCleanup(profileStore)

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "..", "dist")
  : import.meta.dirname

// Explicit annotation: the inferred type reaches into hono internals TS
// cannot name portably (TS2742).
const app: MCPServer<unknown> = await createFrameworkApp({
  name: "acme-mcp",
  version: "0.1.0",
  host: "0.0.0.0",
  // Cast: the toolkit types `plugins` unparameterized; the factories return
  // `AppPlugin<MCPServer>`, which is what the framework passes at runtime.
  plugins: getPlugins(profileStore) as AppPlugin[],
  appConfig: getAppConfig(),
  app: {
    // The compiled widget bundle. Read ONCE at boot — after rebuilding the
    // bundle, restart the server.
    bundle: {
      jsPath: path.join(DIST_DIR, "mcp-app.js"),
      cssPath: path.join(DIST_DIR, "mcp-app.css"),
    },
    // Visual builder + dashboard-persistence tools.
    builder: true,
    dashboardStore: createDashboardStore(),
  },
})

// Ambient per-request info (session id, auth user, Authorization header) for
// consumers without a handler `ctx` — notably profile-key resolution.
installMcpRequestContext(app)

// One log line per tools/call (no arguments/results — they can carry
// credentials or PII), and the dev-CLI views-prime workaround (no-op outside
// `mcp-use dev`) — both shared host boot helpers.
installToolCallLogging(app, "acme-mcp")
swallowDevCliViewsPrime(app)

export default app

// `mcp-use dev` imports this entry, takes the default export, and owns the
// socket itself; self-serving below stays for production (`node dist/index.js`).
if (!process.env.MCP_USE_DEV_CLI) {
  await app.listen(resolvePort({ label: "acme-mcp" }))
}
