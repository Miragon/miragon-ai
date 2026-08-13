import { createFileSystemDashboardStore } from "@miragon/mcp-toolkit-core/tools"
import type { DashboardStore } from "@miragon/mcp-toolkit-core/tools"
import {
  profileStoreFromEnv,
  startProfileSessionCleanup,
  type ProfileStore,
} from "@miragon-ai/widget-shell/server"

/**
 * Deliberately minimal persistence selection, built entirely from the shared
 * kit: filesystem-backed when the env knob is set (survives restarts),
 * in-memory otherwise. The stock server
 * (apps/mcp-server-camunda7/src/persistence/ in the miragon-ai repo) shows the
 * full version — Postgres profile/dashboard stores behind DATABASE_URL with
 * migrations, and warnings for the removed Redis session backends.
 */

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
 * Expire SESSION-keyed profile records (see `startProfileSessionCleanup` in
 * `@miragon-ai/widget-shell/server` — `MCP_PROFILE_SESSION_TTL_DAYS` tunes the
 * window, default 30 days, `0` disables; the timer never holds the process
 * open).
 */
export function startSessionCleanup(
  store: ProfileStore,
  env: NodeJS.ProcessEnv = process.env,
): () => void {
  return startProfileSessionCleanup(store, { env, label: "acme-mcp" })
}
