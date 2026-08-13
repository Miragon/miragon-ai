import type { AppConfig, AppConfigEntry, AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"

import { camunda7Module, createBpmnXmlFetcher } from "@miragon-ai/camunda7-connector"
import { analyticsModule } from "@miragon-ai/analytics-connector"
import { notesModule } from "@acme/mcp-notes"
import {
  composeModules,
  createShellPlugin,
  type ProfileStore,
} from "@miragon-ai/widget-shell/server"
import type { ModuleDefinition, SharedResources } from "./module-contract.js"
import { createProfileStore } from "./persistence.js"

/**
 * The bundle definition: which modules THIS app composes. Each module brings
 * its own config schema, env mapping and known env vars (see
 * `module-contract.ts`) — this file only selects (via the shared
 * `composeModules` machinery), warns, and wires.
 *
 * Adding a module touches four places (README "Adding your own module"):
 * this list, the widget spread in `src/ui/widget-registry.ts` (link 3 of the
 * four-link widget chain), a Tailwind `@source` entry in
 * `src/ui/globals.css` (missing = silently unstyled widgets), and the
 * module's `definition` in `test/widget-registry.test.ts` so the guard
 * covers it.
 */
const MODULES: readonly ModuleDefinition[] = [camunda7Module, analyticsModule, notesModule]

/**
 * App-owned env vars; each module contributes its own slice via
 * `knownEnvVars`. Every known var contributes its prefix to the typo watcher
 * (NOTES_TITLE → NOTES_, PROMETHEUS_URL → PROMETHEUS_, …), so custom modules
 * get the same coverage as the CAMUNDA_/MCP_ families.
 */
const APP_ENV_VARS = [
  "MCP_URL",
  "MCP_ACTIVE_MODULES",
  "MCP_DASHBOARD_DIR",
  "MCP_PROFILE_DIR",
  "MCP_PROFILE_SESSION_TTL_DAYS",
  "MCP_DEBUG_LEVEL",
]

const composition = composeModules<SharedResources>({
  label: "acme-mcp",
  modules: MODULES,
  appEnvVars: APP_ENV_VARS,
})

/** Exported for the `.env.example` guard in `test/env-example.test.ts`. */
export const KNOWN_ENV_VARS = composition.knownEnvVars

export const warnUnknownEnvVars = composition.warnUnknownEnvVars
export const emitBootWarnings = composition.emitBootWarnings

export function getAppConfig(): AppConfig {
  return composition.appConfig()
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
