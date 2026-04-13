import type { ModulePlugin } from "@automation-mcp/core"
import { createClickHouseClient } from "./client.js"
import { registerTools } from "./tools/index.js"
import { registerWidgetTools } from "./widget-tools.js"

export interface AnalyticsPluginConfig {
  url: string
  username: string
  password: string
  database: string
}

export function createPlugin(config: AnalyticsPluginConfig): ModulePlugin {
  const client = createClickHouseClient(config)
  return {
    name: "analytics",
    version: "0.1.0",
    description:
      "Camunda process analytics via ClickHouse: search, performance KPIs, failure patterns, trace reconstruction.",
    registerTools: (server) => {
      registerTools(server, client)
    },
    registerWidgetTools: (server, resourceUri) => {
      registerWidgetTools(server, client, resourceUri)
    },
  }
}
