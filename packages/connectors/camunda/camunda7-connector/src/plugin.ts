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
import { allowsProfileSave, resolveCamunda7Toolset, withToolsetFilter } from "./lib/toolsets.js"
import { resolveProfileKey } from "./lib/resolve-profile-key.js"
import { createModelSurface } from "./widget-tools/model-surface.js"
import { withEngineParam } from "./lib/with-engine.js"

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
   * Per-request deadline for every engine call in ms (env:
   * `CAMUNDA_REQUEST_TIMEOUT_MS`); unset = the client default (30 s). A hung
   * engine then fails the tool call with a timeout error naming the engine.
   */
  requestTimeoutMs?: number
  /**
   * Optional `owner/repo` of the ONE GitHub repository incident-ticket drafts
   * target (env: `CAMUNDA_INCIDENT_ISSUE_REPO`). Fixed by the operator — no
   * tool or prompt argument can redirect it — it enables the draft's
   * prefilled new-issue URL; without it there is no URL. The
   * `camunda7_format_incident_issue` tool and the `draft_incident_ticket`
   * prompt produce a tracker-agnostic draft either way and never file anything
   * themselves.
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
 * the same per-user preferences). Optional so the plugin stays usable
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
  // Resolved ONCE per plugin: every gate below (registrar filter, the
  // ENGINE_NOT_SELECTED hint, widget write buttons, profile save) reads this one concrete
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
      return providerForEntry(e).createClient(e, auth, { timeoutMs: config.requestTimeoutMs })
    },
    {
      // Per-call fallback when no `engine` override is given: the caller's
      // saved default (`profile.modules.camunda7.defaultEngineId`), resolved
      // from the tool call's ctx (pipeline steps: the ambient request info) —
      // the same store the settings tools write, so camunda7_select_engine
      // and the settings page feed the same routing.
      defaultEngineId: (call) => profileDefaultEngineId(profileStore, config.engines, call),
      // Whether ENGINE_NOT_SELECTED may point at camunda7_select_engine: the
      // toolset registers the save AND this caller has an identity to save
      // under — resolved from the same call ctx (the select handler refuses
      // otherwise).
      canSaveDefault: (call) => allowsProfileSave(toolset) && resolveProfileKey(call) !== undefined,
    },
  )

  const incidentIssueConfig = {
    repository: config.incidentIssueRepository,
    // No cockpit URL here: issue links render with the per-engine cockpit URL
    // of the engine the call resolves to.
  }
  // What the module registers for the model, recorded across both hooks —
  // the widgets filter every tool their hand-offs name by it (#338).
  const surface = createModelSurface()

  return {
    definition,
    appConfig: {
      registry,
      engines: config.engines,
    },
    registerTools: (server) => {
      // Ambient request info FIRST for the ctx-less paths: passthrough auth
      // (resolveMcpBearerToken) and the pipeline steps' default-engine
      // lookup read it. Idempotent — the host installs it too.
      installMcpRequestContext(server)
      // One registrar for the whole module, wrapped in the toolset filter so a
      // `camunda7:read-only` / `:operations` / `:admin` deployment only
      // advertises its subset — always filtered, there is no "everything" —
      // and in the boot-time `engine` enum of the configured ids.
      // Strict input: an unknown (e.g. misnamed) key is a tool error naming
      // the valid keys, never a silently stripped filter that widens the
      // result to the whole engine (#329).
      const register = withEngineParam(
        withToolsetFilter(
          createToolRegistrar(surface.record(server), registry, { strictInput: true }),
          toolset,
        ),
        config.engines,
      )
      registerEngineTools(register, profileStore)
      // Deployments are opt-in on top of `admin` (code execution in the JVM).
      registerTools(register, { allowDeployments: config.allowDeployments })
      registerIncidentIssueTools(register, incidentIssueConfig)
      registerIncidentIssuePrompt(server, incidentIssueConfig)
    },
    registerWidgetTools: (server) => {
      // The toolset decides which in-widget write buttons render
      // (`camunda7_widget_actions_data`), mirroring the registrar filter; the
      // same feed reports the recorded model surface for the hand-offs.
      const recorded = surface.record(server)
      registerWidgetTools(recorded, registry, {
        healthThresholds: config.healthThresholds,
        profileStore,
        toolset,
        modelTools: surface.tools,
      })
      // Profile tools render/own the settings widget; the engine registry is
      // read only for the configured engine list the settings UI offers as
      // availability checkboxes. The toolset is threaded through so the
      // durable save tool stays out of `read-only`.
      registerUserProfileTools(recorded, profileStore, registry, toolset)
    },
  }
}
