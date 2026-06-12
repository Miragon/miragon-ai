import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import type { MCPServer } from "mcp-use/server"
import { createCamunda7Client, type Camunda7AuthType } from "@miragon-ai/client-cibseven"
import { registerTools } from "./tools/index.js"
import { registerIncidentIssuePrompt, registerIncidentIssueTools } from "./tools/incident-issue.js"
import { registerEngineTools } from "./tools/engines.js"
import { registerWidgetTools } from "./widget-tools.js"
import { definition } from "./definition.js"
import { createEngineRegistry, type EngineEntry } from "./lib/resolve-engine.js"
import { withToolsetFilter } from "./lib/toolsets.js"

export interface Camunda7PluginConfig {
  engines: EngineEntry[]
  authType?: Camunda7AuthType
  username?: string
  password?: string
  token?: string
  /**
   * Optional named tool subset to expose (`read-only`, `operations`, `admin`
   * — see `lib/toolsets.ts` for the rule). Omitted = all tools. Unknown
   * values warn and fail open to all tools.
   */
  toolset?: string
  /**
   * Optional `owner/repo` of a GitHub repository — purely a convenience for
   * GitHub customers (enables the prefilled new-issue URL and a default target
   * when the user asks to file there). The `camunda7_format_incident_issue`
   * tool and the `draft_incident_ticket` prompt produce a tracker-agnostic
   * draft either way and never file anything themselves.
   */
  incidentIssueRepository?: string
  /**
   * Per-deployment overrides for the engine-health traffic-light thresholds
   * (see `DEFAULT_HEALTH_THRESHOLDS`). A small DC installation may turn
   * critical at 10 incidents where a large one tolerates hundreds.
   */
  healthThresholds?: {
    criticalIncidents?: number
    criticalClusterSize?: number
  }
}

export function createPlugin(config: Camunda7PluginConfig): AppPlugin<MCPServer> {
  const registry = createEngineRegistry(config.engines, (e) =>
    createCamunda7Client({
      baseUrl: e.baseUrl,
      authType: config.authType,
      username: config.username,
      password: config.password,
      token: config.token,
    }),
  )

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
      // One registrar for the whole module, wrapped in the toolset filter so a
      // `camunda7:read-only` / `:operations` / `:admin` deployment only
      // advertises its subset (no toolset = everything, unchanged default).
      const register = withToolsetFilter(createToolRegistrar(server, registry), config.toolset)
      registerEngineTools(register)
      registerTools(register)
      registerIncidentIssueTools(register, incidentIssueConfig)
      registerIncidentIssuePrompt(server, incidentIssueConfig)
    },
    registerWidgetTools: (server, resourceUri) => {
      registerWidgetTools(server, registry, resourceUri, {
        healthThresholds: config.healthThresholds,
      })
    },
  }
}
