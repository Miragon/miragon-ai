#!/usr/bin/env node

import path from "node:path"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createFrameworkApp } from "@miragon/mcp-toolkit-core/tools"
import { parseProxyConfigEnv } from "@miragon/mcp-toolkit-proxy-contract"
import { getAppConfig, getPlugins } from "./setup.js"

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "..", "dist")
  : import.meta.dirname

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
    resourceUri: "ui://automation-mcp/mcp-app.html",
    htmlPath: path.join(DIST_DIR, "mcp-app.html"),
  },
})

await app.listen(Number(process.env.PORT ?? 8400))
