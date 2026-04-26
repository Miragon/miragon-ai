import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use/server"
import { createClickHouseClient } from "@miragon-ai/client-analytics"
import type { Client as Camunda7Client } from "@miragon-ai/client-cibseven"
import { registerTools } from "./tools/index.js"
import { registerWidgetTools } from "./widget-tools.js"
import { definition } from "./definition.js"

export interface AnalyticsPluginConfig {
  url: string
  username: string
  password: string
  database: string
  /**
   * Optional Camunda7 client used by widget tools to fetch BPMN XML on the
   * fly (e.g. for the path-frequency heatmap overlay). When absent, widgets
   * that need a diagram fall back to a non-diagram rendering.
   */
  camunda7Client?: Camunda7Client
}

export function createPlugin(config: AnalyticsPluginConfig): AppPlugin<MCPServer> {
  const client = createClickHouseClient(config)
  const camunda7Client = config.camunda7Client
  return {
    definition,
    appConfig: { client },
    registerTools: (server) => {
      registerTools(server, client)
    },
    registerWidgetTools: (server, resourceUri) => {
      registerWidgetTools(server, client, resourceUri, { camunda7Client })
    },
  }
}
