import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use/server"
import { createPrometheusClient } from "@miragon-ai/client-analytics"
import type { Client as Camunda7Client } from "@miragon-ai/client-cibseven"
import { registerTools } from "./tools/index.js"
import { registerWidgetTools } from "./widget-tools.js"
import { definition } from "./definition.js"

export interface AnalyticsPluginConfig {
  /** Base URL of the Prometheus HTTP API (e.g. http://localhost:9090). */
  url: string
  /**
   * Optional Camunda7 client used by widget tools that enrich metric data with
   * engine lookups — currently the BPMN heatmap, which fetches the diagram XML.
   * When absent, those widgets degrade to a non-diagram fallback.
   */
  camunda7Client?: Camunda7Client
}

export function createPlugin(config: AnalyticsPluginConfig): AppPlugin<MCPServer> {
  const client = createPrometheusClient({ url: config.url })
  return {
    definition,
    appConfig: { client },
    registerTools: (server) => {
      registerTools(server, client)
    },
    registerWidgetTools: (server, resourceUri) => {
      registerWidgetTools(server, client, resourceUri, { camunda7Client: config.camunda7Client })
    },
  }
}
