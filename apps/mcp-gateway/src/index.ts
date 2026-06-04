#!/usr/bin/env node

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { parseProxyConfigEnv } from "@miragon/mcp-toolkit-proxy-contract"
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

await app.listen(Number(process.env.PORT ?? 8400))
