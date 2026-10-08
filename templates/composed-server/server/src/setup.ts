import type { AppConfig, AppConfigEntry, AppPlugin } from "@miragon/mcp-toolkit-core"
import { createFileSystemDashboardStore } from "@miragon/mcp-toolkit-core/tools"
import type { DashboardStore } from "@miragon/mcp-toolkit-core/tools"
import type { MCPServer } from "mcp-use"

import { camunda7Module, createBpmnXmlFetcher } from "@miragon-ai/camunda7-connector"
import { analyticsModule, type FetchBpmnXml } from "@miragon-ai/analytics-connector"
import { notesModule } from "@acme/mcp-notes"
import {
  composeModules,
  createShellPlugin,
  HTTP_EDGE_ENV_VARS,
  profileStoreFromEnv,
  startProfileSessionCleanup,
  type ComposableModule,
  type ProfileStore,
  type ResolvedBoot,
} from "@miragon-ai/widget-shell/server"

/**
 * Cross-module resources the server wires at boot and threads into every
 * module's plugin. App-owned on purpose: which module's capability reaches
 * which other module is configuration knowledge — modules stay peers and
 * never import each other.
 */
export interface SharedResources {
  /**
   * One per-session preference store for the whole server (language, theme,
   * engine and dashboard defaults). Filesystem-backed when `MCP_PROFILE_DIR`
   * is set, else in-memory.
   */
  profileStore: ProfileStore
  /**
   * BPMN-XML lookup from the camunda7 module, consumed by the analytics
   * heatmap. Absent when camunda7 is inactive — consumers degrade gracefully.
   */
  fetchBpmnXml?: FetchBpmnXml
}

/**
 * The port every mounted module satisfies — structurally: modules never
 * import this file, and your own module doesn't have to either. The port
 * shape and selection machinery live in `@miragon-ai/widget-shell/server`;
 * this app only instantiates it with its own `SharedResources`.
 */
export type ModuleDefinition = ComposableModule<SharedResources>

/**
 * Which modules THIS server composes. Each module brings its own config
 * schema, env mapping and known env vars — this file only selects and wires.
 *
 * Adding a module touches three places (the `create-module` skill walks
 * through them): this list, the spread in `src/ui/widget-registry.ts`, and
 * the module's `definition` in `test/widget-registry.test.ts` — Tailwind
 * picks up workspace modules automatically via the `modules/` glob in
 * `src/ui/globals.css`.
 */
const MODULES: readonly ModuleDefinition[] = [camunda7Module, analyticsModule, notesModule]

/**
 * App-owned env vars; each module contributes its own slice via
 * `knownEnvVars`, the shared HTTP edge (`MCP_URL`, the Host/Origin
 * allow-lists, the body cap, the metrics token) via `HTTP_EDGE_ENV_VARS`.
 * Every known var feeds the boot-time typo warner.
 */
const APP_ENV_VARS = [
  ...HTTP_EDGE_ENV_VARS,
  "MCP_ACTIVE_MODULES",
  "MCP_DASHBOARD_DIR",
  "MCP_PROFILE_DIR",
  "MCP_PROFILE_SESSION_TTL_DAYS",
  "MCP_DEBUG_LEVEL",
]

/** The composition `createApp` hands to the shared boot (`createComposedServer`). */
export const composition = composeModules<SharedResources>({
  label: "acme-mcp",
  modules: MODULES,
  appEnvVars: APP_ENV_VARS,
})

/** Exported for the `.env.example` guard in `test/env-example.test.ts`. */
export const KNOWN_ENV_VARS = composition.knownEnvVars

/**
 * The module selection as the shared boot resolves it: each module's
 * effective toolset threaded into its config. This server installs no OAuth,
 * so the selection is unauthenticated — every module without an explicit
 * suffix runs its read-only floor (`MCP_ACTIVE_MODULES=camunda7:operations`
 * widens it, for anyone who reaches the port), and the toolkit's dashboard
 * builder stays off. `createApp` passes an OAuth provider to
 * `createComposedServer` only once it really installs one.
 */
export function resolveBoot(env: NodeJS.ProcessEnv = process.env): ResolvedBoot {
  return composition.resolveBoot(env)
}

export function getAppConfig(boot: ResolvedBoot = resolveBoot()): AppConfig {
  return { activeApps: boot.entries, pipelines: {} }
}

// ── Persistence ──────────────────────────────────────────────────────────
// Deliberately minimal: filesystem-backed when the env knob is set (survives
// restarts), in-memory otherwise. For Postgres stores with migrations, see
// the stock server (`apps/mcp-server-camunda7/src/persistence/` in the
// miragon-ai repo).

export function createProfileStore(env: NodeJS.ProcessEnv = process.env): ProfileStore {
  return profileStoreFromEnv(env)
}

/** `undefined` lets the toolkit fall back to its in-memory dashboard store. */
export function createDashboardStore(
  env: NodeJS.ProcessEnv = process.env,
): DashboardStore | undefined {
  return env.MCP_DASHBOARD_DIR
    ? createFileSystemDashboardStore({ dir: env.MCP_DASHBOARD_DIR })
    : undefined
}

/**
 * Expire SESSION-keyed profile records (`MCP_PROFILE_SESSION_TTL_DAYS` tunes
 * the window, default 30 days, `0` disables).
 */
export function startSessionCleanup(
  store: ProfileStore,
  env: NodeJS.ProcessEnv = process.env,
): () => void {
  return startProfileSessionCleanup(store, { env, label: "acme-mcp" })
}

// ── Plugins ──────────────────────────────────────────────────────────────

/**
 * Cross-module wiring — deliberately app-owned: which module's capability
 * reaches which other module is configuration knowledge.
 */
function buildSharedResources(
  entries: AppConfigEntry[],
  profileStore: ProfileStore,
): SharedResources {
  // camunda7's BPMN-XML lookup for modules that need diagram XML without an
  // engine-SDK dependency (the analytics heatmap). Absent when camunda7 is
  // inactive — consumers degrade gracefully.
  const camunda7Entry = entries.find((e) => e.app === camunda7Module.name)
  if (!camunda7Entry) return { profileStore }
  return { profileStore, fetchBpmnXml: createBpmnXmlFetcher(camunda7Entry.config) }
}

/**
 * `createApp` passes the store it built and the once-per-boot selection; the
 * defaults keep argument-less callers (tests) working without duplicating
 * either here.
 */
export function getPlugins(
  profileStore: ProfileStore = createProfileStore(),
  boot: ResolvedBoot = resolveBoot(),
): AppPlugin<MCPServer>[] {
  const { entries } = boot
  const shared = buildSharedResources(entries, profileStore)
  return [
    // Always-on generic widgets (`shell:*`) — no tools, so deliberately
    // outside the MCP_ACTIVE_MODULES selection.
    createShellPlugin(),
    ...composition.pluginsFor(entries, shared),
  ]
}
