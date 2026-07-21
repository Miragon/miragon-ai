import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use/server"
import type { ProfileStore } from "@miragon-ai/mcp-camunda7"
import type { FetchBpmnXml } from "@miragon-ai/mcp-analytics"

/**
 * Cross-module resources this app wires at boot and threads into every
 * module's plugin. Owned by the app on purpose: which module's capability
 * reaches which other module (e.g. camunda7's BPMN-XML lookup feeding the
 * analytics heatmap) is configuration knowledge — modules stay peers and
 * never import each other.
 */
export interface SharedResources {
  /**
   * One per-session preference store for the whole server, so engine
   * availability, locale, theme, dashboard and analytics defaults come from
   * one source. Filesystem-backed when `MCP_PROFILE_DIR` is set (survives
   * restarts), else in-memory.
   */
  profileStore: ProfileStore
  /**
   * Engine-agnostic BPMN-XML lookup (from the camunda7 module's primary
   * engine) consumed by the analytics heatmap. Absent when the camunda7
   * module is inactive — consumers degrade gracefully.
   */
  fetchBpmnXml?: FetchBpmnXml
}

/**
 * The app-owned port every mounted module satisfies (structurally — modules
 * do not import this file). A module brings its whole config surface itself:
 * schema validation inside `createPlugin`, env mapping, its slice of the
 * env-typo warner, and optional boot-time hints. The app is left with module
 * selection (`MCP_ACTIVE_MODULES`) and cross-module wiring only.
 */
export interface ModuleDefinition {
  /** Module key used in `MCP_ACTIVE_MODULES` and as the `activeApps` entry name. */
  name: string
  /** Pure env → raw-config mapping; must not read `process.env` or perform I/O side effects beyond config sources. */
  configFromEnv(env: NodeJS.ProcessEnv): Record<string, unknown>
  /** Env vars this module reads — composed into the app's unknown-var typo warner. */
  knownEnvVars: readonly string[]
  /** Whether the module understands the `module:toolset` suffix syntax. */
  supportsToolsets: boolean
  /** Optional boot-time hints (returned, and logged by the app) for active deployments. */
  bootWarnings?(env: NodeJS.ProcessEnv): string[]
  /** Validates the raw config and builds the plugin; receives the shared resources. */
  createPlugin(config: Record<string, unknown>, shared: SharedResources): AppPlugin<MCPServer>
}
