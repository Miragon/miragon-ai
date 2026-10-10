import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"
import { installMcpRequestContext } from "@miragon-ai/widget-shell/server"
import { createPrometheusClient, type PrometheusConfig } from "@miragon-ai/analytics-client"
import { registerTools } from "./tools/index.js"
import { registerSettingsTools } from "./settings-tools.js"
import { registerWidgetTools, type FetchBpmnXml } from "./widget-tools.js"
import { definition } from "./definition.js"
import type { ProfileSource } from "./server-locale.js"
import { analyticsToolsets } from "./toolsets.js"
import { createEngineScope } from "./engine-ids.js"
import type { AnalyticsAppConfig } from "./steps/app-config.js"

/**
 * `PrometheusConfig` carries the connection: the base URL (e.g.
 * http://localhost:9090), optional bearer/basic auth + extra headers, and the
 * per-query deadline (`timeoutMs`).
 */
export interface AnalyticsPluginConfig extends PrometheusConfig {
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
   * The module's toolset (`analyticsModule` passes the one the composition
   * root resolved). `"read-only"` — also what an ABSENT or unknown toolset
   * resolves to (an unknown name warns) — registers no settings save tool;
   * `"standard"` registers it, given a writable `profileStore`. Typed `string`
   * like camunda7's, so callers can pass a configured value through; it is
   * resolved fail-closed here.
   */
  toolset?: string
  /**
   * The engine ids analytics may read — the server's configured engines.
   * Empty or absent: every engine-reading tool refuses (fail-closed), see
   * `engine-ids.ts`.
   */
  engineIds?: readonly string[]
}

export function createPlugin(config: AnalyticsPluginConfig): AppPlugin<MCPServer> {
  const client = createPrometheusClient({
    url: config.url,
    bearerToken: config.bearerToken,
    username: config.username,
    password: config.password,
    headers: config.headers,
    timeoutMs: config.timeoutMs,
  })
  const engineScope = createEngineScope(config.engineIds)
  // The steps get the profile store too: a step's omitted period resolves to
  // the caller's saved default, like every tool's.
  const appConfig = {
    client,
    engineScope,
    profileStore: config.profileStore,
  } satisfies AnalyticsAppConfig
  return {
    definition,
    appConfig,
    // Tools and feeds resolve the caller (saved defaults, summary locale) from
    // the handler ctx. The pipeline steps get none, so their saved-period
    // lookup reads the ambient request info — installed here like camunda7
    // does (idempotent; the host installs it too).
    registerTools: (server) => {
      installMcpRequestContext(server)
      registerTools(server, client, engineScope, config.profileStore)
    },
    registerWidgetTools: (server) => {
      registerWidgetTools(server, client, {
        fetchBpmnXml: config.fetchBpmnXml,
        profileStore: config.profileStore,
        engineScope,
      })
      registerSettingsTools(server, config.profileStore, analyticsToolsets.resolve(config.toolset))
    },
  }
}
