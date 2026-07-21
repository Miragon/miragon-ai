import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use/server"
import { createPrometheusClient } from "@miragon-ai/client-analytics"
import { registerTools } from "./tools/index.js"
import { registerWidgetTools, type FetchBpmnXml } from "./widget-tools.js"
import { definition } from "./definition.js"
import type { LocaleSource } from "./server-locale.js"

export interface AnalyticsPluginConfig {
  /** Base URL of the Prometheus HTTP API (e.g. http://localhost:9090). */
  url: string
  /**
   * Optional BPMN-XML lookup used by widget tools that enrich metric data with
   * engine lookups — currently the BPMN heatmap, which fetches the diagram XML.
   * Injected by the host app (which owns the engine client) so this module
   * stays free of engine SDKs. When absent, those widgets degrade to a
   * non-diagram fallback.
   */
  fetchBpmnXml?: FetchBpmnXml
  /** Profile store (shared with camunda7) for localizing model-facing summaries. */
  profileStore?: LocaleSource
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
      registerWidgetTools(server, client, resourceUri, {
        fetchBpmnXml: config.fetchBpmnXml,
        profileStore: config.profileStore,
      })
    },
  }
}
