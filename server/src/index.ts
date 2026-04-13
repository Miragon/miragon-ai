#!/usr/bin/env node

import { MCPServer, RESOURCE_MIME_TYPE } from "mcp-use/server"
import fs from "node:fs/promises"
import path from "node:path"
import { createPlugins, registerModuleTools, registerWidgetTools } from "./setup.js"

const plugins = createPlugins()

const server = new MCPServer({
  name: "automation-mcp",
  version: "0.1.0",
  host: "0.0.0.0",
  baseUrl: process.env.MCP_URL || undefined,
})

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "..", "dist")
  : import.meta.dirname

const resourceUri = "ui://automation-mcp/mcp-app.html"

registerModuleTools(server, plugins)
registerWidgetTools(server, resourceUri, plugins)

server.resource(
  {
    name: "mcp-app-html",
    uri: resourceUri,
    mimeType: RESOURCE_MIME_TYPE,
  },
  async () => {
    const html = await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf-8")
    return {
      contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
    }
  },
)

await server.listen(Number(process.env.PORT ?? 3010))
