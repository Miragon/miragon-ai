import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"
import { createPrometheusClient } from "@miragon-ai/analytics-client"
import { installMcpRequestContext } from "@miragon-ai/widget-shell/server"
import { registerTools } from "./tools/index.js"
import { registerSettingsTools } from "./settings-tools.js"
import { registerWidgetTools, type FetchBpmnXml } from "./widget-tools.js"
import { definition } from "./definition.js"
import type { ProfileSource } from "./server-locale.js"
import type { AnalyticsToolset } from "./toolsets.js"

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
  /**
   * Profile store (shared with camunda7): locale for model-facing summaries,
   * plus this module's own settings slice (`modules.analytics`) — read for
   * period/minBucketSize defaults, written by `analytics_save_settings`.
   */
  profileStore?: ProfileSource
  /**
   * The module's effective toolset (`analyticsModule` resolves it from the
   * composition root's selection). `"read-only"` — also what an ABSENT toolset
   * resolves to — registers no settings save tool; `"standard"` registers it,
   * given a writable `profileStore`.
   */
  toolset?: AnalyticsToolset
}

export function createPlugin(config: AnalyticsPluginConfig): AppPlugin<MCPServer> {
  const client = createPrometheusClient({ url: config.url })
  return {
    definition,
    appConfig: { client },
    registerTools: (server) => {
      // Ambient per-request context (session id, auth) that profile-key/locale
      // resolution reads — idempotent, so a host that already installed it is
      // fine.
      installMcpRequestContext(server)
      registerTools(server, client, config.profileStore)
    },
    registerWidgetTools: (server) => {
      registerWidgetTools(server, client, {
        fetchBpmnXml: config.fetchBpmnXml,
        profileStore: config.profileStore,
      })
      registerSettingsTools(server, config.profileStore, config.toolset)
    },
  }
}
