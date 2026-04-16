import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use/server"
import { createClickHouseClient } from "@miragon-ai/client-analytics"
import { registerTools } from "./tools/index.js"
import { registerWidgetTools } from "./widget-tools.js"
import { definition } from "./definition.js"

export interface AnalyticsPluginConfig {
  url: string
  username: string
  password: string
  database: string
}

export function createPlugin(config: AnalyticsPluginConfig): AppPlugin<MCPServer> {
  const client = createClickHouseClient(config)
  return {
    definition,
    appConfig: { client },
    registerTools: (server) => {
      registerTools(server, client)
    },
    registerWidgetTools: (server, resourceUri) => {
      registerWidgetTools(server, client, resourceUri)
    },
  }
}
