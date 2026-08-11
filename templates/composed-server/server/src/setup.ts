import type { AppConfig, AppConfigEntry, AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"

import { camunda7Module, createBpmnXmlFetcher, type ProfileStore } from "@miragon-ai/mcp-camunda7"
import { analyticsModule } from "@miragon-ai/mcp-analytics"
import { notesModule } from "@acme/mcp-notes"
import { createShellPlugin } from "@miragon-ai/widget-shell/server"
import type { ModuleDefinition, SharedResources } from "./module-contract.js"
import { createProfileStore } from "./persistence.js"

/**
 * The bundle definition: which modules THIS app composes. Each module brings
 * its own config schema, env mapping and known env vars (see
 * `module-contract.ts`) — this file only selects, warns, and wires.
 *
 * Adding a module touches four places (README "Adding your own module"):
 * this list, the widget spread in `src/ui/widget-registry.ts` (link 3 of the
 * four-link widget chain), a Tailwind `@source` entry in
 * `src/ui/globals.css` (missing = silently unstyled widgets), and the
 * module's `definition` in `test/widget-registry.test.ts` so the guard
 * covers it.
 */
const MODULES: readonly ModuleDefinition[] = [camunda7Module, analyticsModule, notesModule]

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
  "MCP_ACTIVE_MODULES",
  "MCP_DASHBOARD_DIR",
  "MCP_PROFILE_DIR",
  "MCP_PROFILE_SESSION_TTL_DAYS",
  // mcp-use's own logger knob, consumed in-process (unprefixed, unlike the
  // rest of its MCP_USE_* family).
  "MCP_DEBUG_LEVEL",
]

/** Exported for the `.env.example` guard in `test/env-example.test.ts`. */
export const KNOWN_ENV_VARS = new Set([
  ...APP_ENV_VARS,
  ...MODULES.flatMap((m) => [...m.knownEnvVars]),
])

/**
 * Prefixes the typo warner watches, derived from every known var (NOTES_TITLE
 * contributes NOTES_, PROMETHEUS_URL contributes PROMETHEUS_, …) so custom
 * modules get the same coverage as the CAMUNDA_ and MCP_ families — a
 * hardcoded prefix list would silently exempt every non-Camunda module.
 */
const KNOWN_ENV_PREFIXES = [
  ...new Set(
    [...KNOWN_ENV_VARS]
      .map((name) => name.slice(0, name.indexOf("_") + 1))
      .filter((prefix) => prefix.length > 1),
  ),
]

const FOREIGN_ENV_PREFIXES = ["MCP_USE_", "MCP_INSPECTOR_"]

/**
 * Reports unknown variables under any watched prefix at boot so a typo
 * (CAMUNDA_ENGINE_JSON, MCP_DASHBOARDS_DIR, NOTES_TITEL) doesn't get silently
 * ignored. Warns instead of throwing: an unknown variable can't misconfigure
 * anything by itself.
 */
export function warnUnknownEnvVars(env: NodeJS.ProcessEnv = process.env): string[] {
  const unknown = Object.keys(env).filter(
    (name) =>
      KNOWN_ENV_PREFIXES.some((prefix) => name.startsWith(prefix)) &&
      !KNOWN_ENV_VARS.has(name) &&
      !FOREIGN_ENV_PREFIXES.some((prefix) => name.startsWith(prefix)),
  )
  for (const name of unknown) {
    console.warn(
      `[acme-mcp] Unknown environment variable "${name}" — the server does not read it; check for a typo.`,
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
    console.warn(`[acme-mcp] ${warning}`)
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
        console.warn(`[acme-mcp] Unknown module "${name}" in MCP_ACTIVE_MODULES — skipping`)
        return false
      }
      return true
    })
}

function getActiveAppEntries(): AppConfigEntry[] {
  return getActiveModules().map(({ name, toolset }) => {
    if (toolset && !MODULE_REGISTRY[name].supportsToolsets) {
      console.warn(
        `[acme-mcp] Module "${name}" has no toolsets — ignoring ":${toolset}" and exposing all tools`,
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
function buildSharedResources(
  entries: AppConfigEntry[],
  profileStore: ProfileStore,
): SharedResources {
  // BPMN-XML lookup from the camunda7 module (its primary engine) for modules
  // that need diagram XML but must not depend on the engine SDK — most notably
  // the analytics heatmap. Absent when camunda7 is inactive (consumers degrade).
  const camunda7Entry = entries.find((e) => e.app === camunda7Module.name)
  if (!camunda7Entry) return { profileStore }
  return { profileStore, fetchBpmnXml: createBpmnXmlFetcher(camunda7Entry.config) }
}

/**
 * `index.ts` passes the store it built; the default keeps argument-less
 * callers (tests) on the filesystem/in-memory path without duplicating that
 * selection here.
 */
export function getPlugins(
  profileStore: ProfileStore = createProfileStore(),
): AppPlugin<MCPServer>[] {
  const entries = getActiveAppEntries()
  const shared = buildSharedResources(entries, profileStore)
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
