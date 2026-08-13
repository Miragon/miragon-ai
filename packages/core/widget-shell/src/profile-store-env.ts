import {
  createFileSystemProfileStore,
  createInMemoryProfileStore,
  type ProfileStore,
} from "./profile-store.js"

/**
 * The non-database profile store selection every composition root shares:
 * filesystem-backed when `MCP_PROFILE_DIR` is set (survives restarts),
 * in-memory otherwise. Roots with a database extend the precedence themselves
 * (`DATABASE_URL` → `createPostgresProfileStore` beats this — see the stock
 * app's `initRuntime`); the factories stay pure and injectable.
 */
export function profileStoreFromEnv(env: NodeJS.ProcessEnv = process.env): ProfileStore {
  return env.MCP_PROFILE_DIR
    ? createFileSystemProfileStore({ dir: env.MCP_PROFILE_DIR })
    : createInMemoryProfileStore()
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Expire SESSION-keyed profile records (no auth user stamped, not the shared
 * anonymous record) at boot and once a day. Session ids die with their MCP
 * session, so these records are unreachable garbage — without a TTL a durable
 * store grows one record per saving session forever.
 * `MCP_PROFILE_SESSION_TTL_DAYS` tunes the window (default 30; `0` disables).
 * Returns the stop function for the shutdown path; the timer is unref'd so it
 * never holds the process open.
 */
export function startProfileSessionCleanup(
  store: ProfileStore,
  options: { env?: NodeJS.ProcessEnv; label?: string } = {},
): () => void {
  const { env = process.env, label = "profile-store" } = options
  const raw = env.MCP_PROFILE_SESSION_TTL_DAYS?.trim()
  const ttlDays = raw === undefined || raw === "" ? 30 : Number.parseInt(raw, 10)
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) return () => {}

  const run = async () => {
    try {
      const removed = await store.cleanupSessions(new Date(Date.now() - ttlDays * DAY_MS))
      if (removed > 0) {
        console.log(`[${label}] expired ${removed} session profile(s) older than ${ttlDays}d`)
      }
    } catch (err) {
      console.warn(`[${label}] session-profile cleanup failed:`, err)
    }
  }
  void run()
  const timer = setInterval(() => void run(), DAY_MS)
  timer.unref()
  return () => clearInterval(timer)
}
