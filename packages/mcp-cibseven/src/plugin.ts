import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import type { MCPServer } from "mcp-use/server"
import { createCamunda7Client, type Camunda7AuthType } from "@miragon-ai/client-cibseven"
import { registerTools } from "./tools/index.js"
import { registerIncidentIssuePrompt, registerIncidentIssueTools } from "./tools/incident-issue.js"
import { registerEngineTools } from "./tools/engines.js"
import { registerWidgetTools } from "./widget-tools.js"
import { definition } from "./definition.js"
import type { EngineEntry, EngineRegistry } from "./lib/resolve-engine.js"

export interface Camunda7PluginConfig {
  engines: EngineEntry[]
  authType?: Camunda7AuthType
  username?: string
  password?: string
  token?: string
  /**
   * `owner/repo` of the GitHub repository where engine incidents should be filed.
   * Used as the default for the `camunda7_format_incident_issue` tool and the
   * `report_incident_to_github` prompt. Per-call overrides remain possible.
   */
  incidentIssueRepository?: string
}

export function createPlugin(config: Camunda7PluginConfig): AppPlugin<MCPServer> {
  const clients = new Map(
    config.engines.map((e) => [
      e.id,
      createCamunda7Client({
        baseUrl: e.baseUrl,
        authType: config.authType,
        username: config.username,
        password: config.password,
        token: config.token,
      }),
    ]),
  )
  const cockpitUrls = new Map(config.engines.map((e) => [e.id, e.cockpitUrl]))
  const registry: EngineRegistry = {
    engines: config.engines,
    clients,
    cockpitUrls,
  }

  const incidentIssueConfig = {
    repository: config.incidentIssueRepository,
    // Cockpit URL for issue-link rendering: per-engine, so the helper falls back
    // to the selected engine at call time. The legacy single-cockpit field is
    // dropped; the resolver picks the right one.
  }

  return {
    definition,
    appConfig: {
      registry,
      engines: config.engines,
    },
    registerTools: (server) => {
      registerEngineTools(server, registry)
      registerTools(server, registry)
      const register = createToolRegistrar(server, registry)
      registerIncidentIssueTools(register, incidentIssueConfig)
      registerIncidentIssuePrompt(server, incidentIssueConfig)
    },
    registerWidgetTools: (server, resourceUri) => {
      registerWidgetTools(server, registry, resourceUri)
    },
  }
}
