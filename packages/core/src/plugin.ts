import type { MCPServer } from "mcp-use/server"

/**
 * Minimal plugin contract. Each module exports a `createPlugin(config)` that
 * returns a ModulePlugin. The server collects plugins from the active modules
 * and calls registerTools / registerWidgetTools during startup.
 */
export interface ModulePlugin {
  name: string
  version: string
  description?: string
  registerTools?: (server: MCPServer) => void
  registerWidgetTools?: (server: MCPServer, resourceUri: string) => void
}
