import { createFileSystemDashboardStore } from "@miragon/mcp-toolkit-core/tools"
import type { DashboardStore } from "@miragon/mcp-toolkit-core/tools"
import {
  createFileSystemProfileStore,
  createInMemoryProfileStore,
  type ProfileStore,
} from "@miragon-ai/mcp-camunda7"

/**
 * Deliberately minimal persistence selection: filesystem-backed when the env
 * knob is set (survives restarts), in-memory otherwise. The stock server
 * (apps/mcp-server-camunda7/src/persistence/ in the miragon-ai repo) shows the
 * full version — Postgres profile/dashboard stores behind DATABASE_URL with
 * migrations, Redis MCP-session backends behind REDIS_URL for multi-instance
 * deployments, and a TTL cleanup for session-keyed profiles.
 */

export function createProfileStore(env: NodeJS.ProcessEnv = process.env): ProfileStore {
  return env.MCP_PROFILE_DIR
    ? createFileSystemProfileStore({ dir: env.MCP_PROFILE_DIR })
    : createInMemoryProfileStore()
}

/** `undefined` lets the toolkit fall back to its in-memory dashboard store. */
export function createDashboardStore(
  env: NodeJS.ProcessEnv = process.env,
): DashboardStore | undefined {
  return env.MCP_DASHBOARD_DIR
    ? createFileSystemDashboardStore({ dir: env.MCP_DASHBOARD_DIR })
    : undefined
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Expire SESSION-keyed profile records (no auth user stamped, not the shared
 * anonymous record) at boot and once a day. Session ids die with their MCP
 * session, so these records are unreachable garbage — without a TTL a durable
 * store grows one record per saving session forever.
 * `MCP_PROFILE_SESSION_TTL_DAYS` tunes the window (default 30; `0` disables).
 * The timer is unref'd so it never holds the process open.
 */
export function startSessionCleanup(
  store: ProfileStore,
  env: NodeJS.ProcessEnv = process.env,
): () => void {
  const raw = env.MCP_PROFILE_SESSION_TTL_DAYS?.trim()
  const ttlDays = raw === undefined || raw === "" ? 30 : Number.parseInt(raw, 10)
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) return () => {}

  const run = async () => {
    try {
      const removed = await store.cleanupSessions(new Date(Date.now() - ttlDays * DAY_MS))
      if (removed > 0) {
        console.log(`[acme-mcp] expired ${removed} session profile(s) older than ${ttlDays}d`)
      }
    } catch (err) {
      console.warn("[acme-mcp] session-profile cleanup failed:", err)
    }
  }
  void run()
  const timer = setInterval(() => void run(), DAY_MS)
  timer.unref()
  return () => clearInterval(timer)
}
