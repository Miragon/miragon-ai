import type { AppConfig, AppConfigEntry, AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"

import { camunda7Module, createBpmnXmlFetcher } from "@miragon-ai/camunda7-connector"
import { analyticsModule } from "@miragon-ai/analytics-connector"
import {
  composeModules,
  createShellPlugin,
  type ProfileStore,
} from "@miragon-ai/widget-shell/server"
import type { ModuleDefinition, SharedResources } from "./module-contract.js"
import { createDefaultProfileStore } from "./persistence/index.js"

/**
 * The bundle definition: which modules THIS app composes. Each module brings
 * its own config schema, env mapping and known env vars (see
 * `module-contract.ts`) — this file only selects (via the shared
 * `composeModules` machinery), warns, and wires.
 */
const MODULES: readonly ModuleDefinition[] = [camunda7Module, analyticsModule]

/**
 * App-owned env vars; each module contributes its own slice via
 * `knownEnvVars`. Foreign prefixes owned by dependencies (`MCP_USE_*`,
 * `MCP_INSPECTOR_*`) are exempt inside `composeModules`.
 */
const APP_ENV_VARS = [
  "MCP_URL",
  "MCP_OAUTH",
  "MCP_ACTIVE_MODULES",
  "MCP_DASHBOARD_DIR",
  "MCP_PROFILE_DIR",
  "MCP_PROFILE_SESSION_TTL_DAYS",
  // Postgres persistence for profiles + dashboards, and Redis MCP-session
  // backends for multi-instance (both in src/persistence/). Listed for
  // documentation AND because every known var contributes its prefix to the
  // typo watcher.
  "DATABASE_URL",
  "REDIS_URL",
  // mcp-use's own logger knob, consumed in-process (unprefixed, unlike the
  // rest of its MCP_USE_* family).
  "MCP_DEBUG_LEVEL",
]

const composition = composeModules<SharedResources>({
  label: "miragon-ai",
  modules: MODULES,
  appEnvVars: APP_ENV_VARS,
  envVarHint: "see docs/operations.md",
})

export const warnUnknownEnvVars = composition.warnUnknownEnvVars
export const emitBootWarnings = composition.emitBootWarnings

export function getAppConfig(): AppConfig {
  return composition.appConfig()
}

/**
 * Cross-module wiring — the one thing that stays app-owned by design: which
 * module's capability reaches which other module is configuration knowledge
 * (see `module-contract.ts`). Store *selection* lives in
 * `src/persistence/initRuntime`; this only distributes the chosen instance.
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
 * `index.ts` passes the store `initRuntime` selected (possibly Postgres); the
 * default keeps argument-less callers (tests) on the filesystem/in-memory
 * path without duplicating that selection here.
 */
export function getPlugins(
  profileStore: ProfileStore = createDefaultProfileStore(),
): AppPlugin<MCPServer>[] {
  const entries = composition.appEntries()
  const shared = buildSharedResources(entries, profileStore)
  return [
    // Always-on generic widgets (`shell:*`) — no tools, no steps, so they are
    // deliberately outside the MCP_ACTIVE_MODULES selection. Catalogue +
    // components both live in @miragon-ai/widget-shell (apps own no domain UI).
    createShellPlugin(),
    ...composition.pluginsFor(entries, shared),
  ]
}
