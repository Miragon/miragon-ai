import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import type { MCPServer } from "mcp-use/server"
import { createCamunda7Client, type Camunda7AuthType } from "@miragon-ai/client-cibseven"
import { registerTools } from "./tools/index.js"
import { registerIncidentIssuePrompt, registerIncidentIssueTools } from "./tools/incident-issue.js"
import { registerWidgetTools } from "./widget-tools.js"
import { definition } from "./definition.js"

export interface Camunda7PluginConfig {
  baseUrl: string
  cockpitUrl?: string
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
  const client = createCamunda7Client({
    baseUrl: config.baseUrl,
    authType: config.authType,
    username: config.username,
    password: config.password,
    token: config.token,
  })
  const incidentIssueConfig = {
    repository: config.incidentIssueRepository,
    cockpitUrl: config.cockpitUrl,
  }
  return {
    definition,
    appConfig: { client, baseUrl: config.baseUrl, cockpitUrl: config.cockpitUrl },
    registerTools: (server) => {
      registerTools(server, client)
      const register = createToolRegistrar(server, client)
      registerIncidentIssueTools(register, incidentIssueConfig)
      registerIncidentIssuePrompt(server, incidentIssueConfig)
    },
    registerWidgetTools: (server, resourceUri) => {
      registerWidgetTools(server, client, resourceUri, {
        baseUrl: config.baseUrl,
        cockpitUrl: config.cockpitUrl,
      })
    },
  }
}
