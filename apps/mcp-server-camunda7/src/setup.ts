import type { AppConfig, AppConfigEntry, AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"

import { camunda7Module, createBpmnXmlFetcher } from "@miragon-ai/camunda7-connector"
import { analyticsModule } from "@miragon-ai/analytics-connector"
import {
  composeModules,
  createShellPlugin,
  frameworkWritesAllowed,
  type ProfileStore,
  type ResolveBootOptions,
  type ResolvedBoot,
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
export const logEffectiveToolsets = composition.logEffectiveToolsets

/**
 * The module selection, resolved ONCE per boot: each module's effective
 * toolset (fail closed — no suffix is the read-only floor unless `index.ts`
 * installed OAuth) threaded into its config. Plugins, `AppConfig` and the
 * builder decision all derive from this one value. The default (no OAuth)
 * keeps argument-less callers (tests) on the restrictive side.
 */
export function resolveBoot(
  options: ResolveBootOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): ResolvedBoot {
  return composition.resolveBoot(env, options)
}

export function getAppConfig(boot: ResolvedBoot = resolveBoot()): AppConfig {
  return { activeApps: boot.entries, pipelines: {} }
}

/**
 * Whether to switch on the toolkit's visual builder and its dashboard tools
 * (`get-builder-catalogue`, `save/list/load/delete-dashboard`). No module
 * toolset filters them, and the dashboard writes are keyed by user, so they
 * exist only under OAuth while no module runs on its read-only floor
 * (`frameworkWritesAllowed`). `render-view`/`refresh-view` stay regardless.
 */
export function builderEnabled(boot: ResolvedBoot): boolean {
  return frameworkWritesAllowed(boot)
}

/**
 * The boot decision `index.ts` makes, single-sourced so the e2e helpers run
 * it too: the selection is authenticated exactly when an OAuth provider was
 * actually BUILT from MCP_OAUTH (unset/blank builds none → the read-only
 * defaults) — never from the raw env var — and the builder follows from it.
 */
export function selectBoot(
  oauthProvider: object | undefined,
  env: NodeJS.ProcessEnv = process.env,
): { boot: ResolvedBoot; builder: boolean } {
  const boot = resolveBoot({ authenticated: oauthProvider !== undefined }, env)
  return { boot, builder: builderEnabled(boot) }
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
 * `index.ts` passes the store `initRuntime` selected (possibly Postgres) and
 * its once-per-boot selection; the defaults keep argument-less callers (tests)
 * on the filesystem/in-memory path and the unauthenticated defaults without
 * duplicating either selection here.
 */
export function getPlugins(
  profileStore: ProfileStore = createDefaultProfileStore(),
  boot: ResolvedBoot = resolveBoot(),
): AppPlugin<MCPServer>[] {
  const { entries } = boot
  const shared = buildSharedResources(entries, profileStore)
  return [
    // Always-on generic widgets (`shell:*`) — no tools, no steps, so they are
    // deliberately outside the MCP_ACTIVE_MODULES selection. Catalogue +
    // components both live in @miragon-ai/widget-shell (apps own no domain UI).
    createShellPlugin(),
    ...composition.pluginsFor(entries, shared),
  ]
}
