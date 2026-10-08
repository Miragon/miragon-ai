import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import type { MCPServer } from "mcp-use"
import { installMcpRequestContext } from "@miragon-ai/widget-shell/server"
import type { Camunda7AuthType } from "@miragon-ai/camunda7-client"
import { providerForEntry } from "./providers/index.js"
import { registerTools } from "./tools/index.js"
import { registerIncidentIssuePrompt, registerIncidentIssueTools } from "./tools/incident-issue.js"
import { registerEngineTools } from "./tools/engines.js"
import { registerUserProfileTools } from "./tools/user-profile.js"
import { registerWidgetTools } from "./widget-tools.js"
import { definition } from "./definition.js"
import { createEngineRegistry, type EngineEntry } from "./lib/resolve-engine.js"
import { profileDefaultEngineId } from "./lib/engine-preferences.js"
import { createInMemoryProfileStore, type ProfileStore } from "@miragon-ai/widget-shell/server"
import { resolveCamunda7Toolset, withToolsetFilter } from "./lib/toolsets.js"

export interface Camunda7PluginConfig {
  engines: EngineEntry[]
  /**
   * Fallback auth for engines without a per-engine `auth` entry.
   * `passthrough` forwards the bearer token each MCP client presents to this
   * server on to the engine per call ([[resolveMcpBearerToken]]) — no static
   * credentials; requires an MCP host that sends an `Authorization` header.
   */
  authType?: Camunda7AuthType
  username?: string
  password?: string
  token?: string
  /**
   * The named tool subset to expose (`read-only`, `operations`, `admin` — see
   * `lib/toolsets.ts` for the rule). The composition root passes the concrete
   * toolset it resolved for this boot (the suffix, or the auth-dependent
   * default). Omitted — only a direct caller does that — means `read-only`,
   * the floor, never everything; unknown values warn and degrade to
   * `read-only` too.
   */
  toolset?: string
  /**
   * Registers `camunda7_create_deployment` (env: `CAMUNDA_ALLOW_DEPLOYMENTS`).
   * Deploy permission IS code execution inside the engine JVM: the deployed
   * models' expressions, scripts and listener/delegate references run with
   * the engine's privileges. The tool is admin-only on top, so it needs BOTH
   * this flag and the `admin` toolset. Default: off.
   */
  allowDeployments?: boolean
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

/**
 * Cross-cutting resources the server threads into the plugin. Currently just
 * the {@link ProfileStore} (shared with the analytics module so both can read
 * the same per-session preferences). Optional so the plugin stays usable
 * standalone (tests, embedding) — it falls back to an in-memory store.
 */
export interface Camunda7SharedResources {
  profileStore?: ProfileStore
}

export function createPlugin(
  config: Camunda7PluginConfig,
  shared: Camunda7SharedResources = {},
): AppPlugin<MCPServer> {
  const profileStore = shared.profileStore ?? createInMemoryProfileStore()
  // Resolved ONCE per plugin: every gate below (registrar filter, engine
  // "select", widget write buttons, profile save) reads this one concrete
  // toolset — an unknown name warns here once and degrades to `read-only`.
  const toolset = resolveCamunda7Toolset(config.toolset)
  const registry = createEngineRegistry(
    config.engines,
    (e) => {
      // Per-engine auth wins wholesale; mixing its fields with the module-wide
      // fallback would make a partial entry silently inherit foreign credentials.
      const auth = e.auth ?? {
        type: config.authType ?? "none",
        username: config.username,
        password: config.password,
        token: config.token,
      }
      // The vendor provider owns client construction (identical across C7
      // vendors today — `providers/create-client.ts`).
      return providerForEntry(e).createClient(e, auth)
    },
    {
      // Per-call fallback when no `engine` override is given: the caller's
      // saved default (`profile.modules.camunda7.defaultEngineId`), read off
      // the ambient request identity — the same store the settings tools
      // write, so "select" and the settings page feed the same routing.
      defaultEngineId: () => profileDefaultEngineId(profileStore, config.engines),
    },
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
      // Ambient request info FIRST: passthrough auth (resolveMcpBearerToken)
      // and profile-key resolution (which also feeds the default-engine
      // lookup) read it. Idempotent — the host may install it too.
      installMcpRequestContext(server)
      // One registrar for the whole module, wrapped in the toolset filter so a
      // `camunda7:read-only` / `:operations` / `:admin` deployment only
      // advertises its subset — always filtered, there is no "everything".
      const register = withToolsetFilter(createToolRegistrar(server, registry), toolset)
      // The toolset is threaded through so the engine tool registers its
      // toolset-shaped variant (read-only: no durable "select") and its
      // handler can still refuse "select" on its own.
      registerEngineTools(register, profileStore, toolset)
      // Deployments are opt-in on top of `admin` (code execution in the JVM).
      registerTools(register, { allowDeployments: config.allowDeployments })
      registerIncidentIssueTools(register, incidentIssueConfig)
      registerIncidentIssuePrompt(server, incidentIssueConfig)
    },
    registerWidgetTools: (server) => {
      // The toolset decides which in-widget write buttons render
      // (`camunda7_widget_actions_data`), mirroring the registrar filter.
      registerWidgetTools(server, registry, {
        healthThresholds: config.healthThresholds,
        profileStore,
        toolset,
      })
      // Profile tools render/own the settings widget; the engine registry is
      // read only for the configured engine list the settings UI offers as
      // availability checkboxes. The toolset is threaded through so the
      // durable save tool stays out of `read-only`.
      registerUserProfileTools(server, profileStore, registry, toolset)
    },
  }
}
