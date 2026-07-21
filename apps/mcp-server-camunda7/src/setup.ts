import type { AppConfig, AppConfigEntry, AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use/server"

import {
  camunda7Module,
  createBpmnXmlFetcher,
  createFileSystemProfileStore,
  createInMemoryProfileStore,
  type ProfileStore,
} from "@miragon-ai/mcp-camunda7"
import { analyticsModule } from "@miragon-ai/mcp-analytics"
import { createShellPlugin } from "@miragon-ai/widget-shell/server"
import type { ModuleDefinition, SharedResources } from "./module-contract.js"

/**
 * The bundle definition: which modules THIS app composes. Each module brings
 * its own config schema, env mapping and known env vars (see
 * `module-contract.ts`) — this file only selects, warns, and wires.
 */
const MODULES: readonly ModuleDefinition[] = [camunda7Module, analyticsModule]

const MODULE_REGISTRY: Record<string, ModuleDefinition> = Object.fromEntries(
  MODULES.map((m) => [m.name, m]),
)

/**
 * App-owned env vars; each module contributes its own slice via
 * `knownEnvVars`. Foreign prefixes owned by dependencies are exempt:
 * `MCP_USE_*` (mcp-use itself), `MCP_INSPECTOR_*` (the dev inspector).
 */
const APP_ENV_VARS = [
  "MCP_URL",
  "MCP_OAUTH",
  "MCP_ACTIVE_MODULES",
  "MCP_DASHBOARD_DIR",
  "MCP_PROFILE_DIR",
  // mcp-use's own logger knob, consumed in-process (unprefixed, unlike the
  // rest of its MCP_USE_* family).
  "MCP_DEBUG_LEVEL",
]

const KNOWN_ENV_VARS = new Set([...APP_ENV_VARS, ...MODULES.flatMap((m) => [...m.knownEnvVars])])

const FOREIGN_ENV_PREFIXES = ["MCP_USE_", "MCP_INSPECTOR_"]

/**
 * Reports unknown CAMUNDA_- and MCP-prefixed variables at boot so a typo
 * (CAMUNDA_ENGINE_JSON, MCP_DASHBOARDS_DIR) doesn't get silently ignored.
 * Warns instead of throwing: an unknown variable can't misconfigure anything
 * by itself.
 */
export function warnUnknownEnvVars(
  env: NodeJS.ProcessEnv = process.env,
  extraKnown: Iterable<string> = [],
): string[] {
  const known = new Set([...KNOWN_ENV_VARS, ...extraKnown])
  const unknown = Object.keys(env).filter(
    (name) =>
      (name.startsWith("CAMUNDA_") || name.startsWith("MCP_")) &&
      !known.has(name) &&
      !FOREIGN_ENV_PREFIXES.some((prefix) => name.startsWith(prefix)),
  )
  for (const name of unknown) {
    console.warn(
      `[miragon-ai] Unknown environment variable "${name}" — the server does not read it; check for a typo (see docs/operations.md).`,
    )
  }
  return unknown
}

/**
 * Collects and logs the active modules' boot-time hints (e.g. analytics'
 * PROMETHEUS_URL default warning). Deliberately separate from
 * `configFromEnv` (which runs twice per boot — getPlugins + getAppConfig —
 * and stays side-effect free).
 */
export function emitBootWarnings(env: NodeJS.ProcessEnv = process.env): string[] {
  const warnings = getActiveModules(env).flatMap(
    ({ name }) => MODULE_REGISTRY[name].bootWarnings?.(env) ?? [],
  )
  for (const warning of warnings) {
    console.warn(`[miragon-ai] ${warning}`)
  }
  return warnings
}

interface ActiveModule {
  name: string
  /**
   * Optional toolset suffix from the `module:toolset` syntax, e.g.
   * `camunda7:read-only`. Validated by the module itself (the camunda7 plugin
   * warns + exposes all tools for unknown toolsets — fail-open, consistent
   * with the unknown-module handling here).
   */
  toolset?: string
}

function getActiveModules(env: NodeJS.ProcessEnv = process.env): ActiveModule[] {
  const envValue = env.MCP_ACTIVE_MODULES?.trim()

  if (!envValue || envValue === "all") {
    return MODULES.map(({ name }) => ({ name }))
  }

  return envValue
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry): ActiveModule => {
      const [name, toolset] = entry.split(":", 2)
      return toolset ? { name, toolset } : { name }
    })
    .filter(({ name }) => {
      if (!MODULE_REGISTRY[name]) {
        console.warn(`[miragon-ai] Unknown module "${name}" in MCP_ACTIVE_MODULES — skipping`)
        return false
      }
      return true
    })
}

function getActiveAppEntries(): AppConfigEntry[] {
  return getActiveModules().map(({ name, toolset }) => {
    if (toolset && !MODULE_REGISTRY[name].supportsToolsets) {
      console.warn(
        `[miragon-ai] Module "${name}" has no toolsets — ignoring ":${toolset}" and exposing all tools`,
      )
      toolset = undefined
    }
    return {
      app: name,
      config: {
        ...MODULE_REGISTRY[name].configFromEnv(process.env),
        ...(toolset ? { toolset } : {}),
      },
    }
  })
}

export function getAppConfig(): AppConfig {
  return {
    activeApps: getActiveAppEntries(),
    pipelines: {},
  }
}

/**
 * Cross-module wiring — the one thing that stays app-owned by design: which
 * module's capability reaches which other module is configuration knowledge
 * (see `module-contract.ts`).
 */
function buildSharedResources(entries: AppConfigEntry[]): SharedResources {
  // One preference store for the whole server, regardless of which modules are
  // active. Filesystem-backed when MCP_PROFILE_DIR is set so profiles survive
  // restarts; otherwise in-memory (fine for dev, lost on restart).
  const profileStore: ProfileStore = process.env.MCP_PROFILE_DIR
    ? createFileSystemProfileStore({ dir: process.env.MCP_PROFILE_DIR })
    : createInMemoryProfileStore()

  // BPMN-XML lookup from the camunda7 module (its primary engine) for modules
  // that need diagram XML but must not depend on the engine SDK — most notably
  // the analytics heatmap. Absent when camunda7 is inactive (consumers degrade).
  const camunda7Entry = entries.find((e) => e.app === camunda7Module.name)
  if (!camunda7Entry) return { profileStore }
  return { profileStore, fetchBpmnXml: createBpmnXmlFetcher(camunda7Entry.config) }
}

export function getPlugins(): AppPlugin<MCPServer>[] {
  const entries = getActiveAppEntries()
  const shared = buildSharedResources(entries)
  return [
    // Always-on generic widgets (`shell:*`) — no tools, no steps, so they are
    // deliberately outside the MCP_ACTIVE_MODULES selection. Catalogue +
    // components both live in @miragon-ai/widget-shell (apps own no domain UI).
    createShellPlugin(),
    ...entries
      .filter((entry) => MODULE_REGISTRY[entry.app])
      .map((entry) => MODULE_REGISTRY[entry.app].createPlugin(entry.config, shared)),
  ]
}
