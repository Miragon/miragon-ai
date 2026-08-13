import { createFileSystemDashboardStore } from "@miragon/mcp-toolkit-core/tools"
import type { DashboardStore } from "@miragon/mcp-toolkit-core/tools"
import {
  createFileSystemProfileStore,
  createInMemoryProfileStore,
  createPostgresProfileStore,
  PROFILE_STORE_MIGRATIONS,
  type ProfileStore,
} from "@miragon-ai/camunda7-connector"
import {
  createPostgresDashboardStore,
  DASHBOARD_STORE_MIGRATIONS,
} from "./dashboard-store-postgres.js"
import { createSql } from "./db.js"
import { runMigrations } from "./migrations.js"

/**
 * Everything the composition root wires that depends on the deployment's
 * persistence choice. `initRuntime` below is the ONLY place environment
 * variables are translated into backend selections — a customer packaging
 * that needs a different mix (other database) either sets different env vars
 * or replaces this one module; the store factories themselves are pure and
 * injectable.
 */
export interface RuntimeBackends {
  profileStore: ProfileStore
  /** `undefined` lets the toolkit fall back to its in-memory default. */
  dashboardStore: DashboardStore | undefined
  /** Closes owned resources (DB pool); wired to SIGTERM/SIGINT in index.ts. */
  shutdown(): Promise<void>
}

/**
 * mcp-use 1.x accepted pluggable Redis session/stream backends
 * (`RedisSessionStore`/`RedisStreamManager` via `serverOptions`) for
 * multi-instance session sharing without sticky routing. mcp-use 2 removed
 * that seam — sessions are instance-local again. Warn instead of silently
 * ignoring the knob so a multi-instance deployment learns it needs sticky
 * routing (or an upstream session-sharing successor) before scaling out.
 */
function warnIgnoredRedisUrl(env: NodeJS.ProcessEnv): void {
  if (env.REDIS_URL?.trim()) {
    console.warn(
      "[miragon-ai] REDIS_URL is set, but mcp-use 2 no longer accepts pluggable session/stream backends — ignoring it. Multi-instance deployments need sticky routing until an upstream successor exists.",
    )
  }
}

/**
 * The non-database profile store selection — filesystem when
 * `MCP_PROFILE_DIR` is set, in-memory otherwise. Also the default `setup.ts`
 * falls back to when `getPlugins()` is called without an explicit store
 * (tests), so the selection logic exists exactly once.
 */
export function createDefaultProfileStore(env: NodeJS.ProcessEnv = process.env): ProfileStore {
  return env.MCP_PROFILE_DIR
    ? createFileSystemProfileStore({ dir: env.MCP_PROFILE_DIR })
    : createInMemoryProfileStore()
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Expire SESSION-keyed profile records (no auth user stamped, not the shared
 * anonymous record) at boot and once a day. Session ids die with their MCP
 * session, so these rows are unreachable garbage — without a TTL a durable
 * store grows one row per session forever. `MCP_PROFILE_SESSION_TTL_DAYS`
 * tunes the window (default 30; `0` disables). Returns the stop function for
 * the shutdown path; the timer is unref'd so it never holds the process open.
 */
function startSessionCleanup(store: ProfileStore, env: NodeJS.ProcessEnv): () => void {
  const raw = env.MCP_PROFILE_SESSION_TTL_DAYS?.trim()
  const ttlDays = raw === undefined || raw === "" ? 30 : Number.parseInt(raw, 10)
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) return () => {}

  const run = async () => {
    try {
      const removed = await store.cleanupSessions(new Date(Date.now() - ttlDays * DAY_MS))
      if (removed > 0) {
        console.log(`[miragon-ai] expired ${removed} session profile(s) older than ${ttlDays}d`)
      }
    } catch (err) {
      console.warn("[miragon-ai] session-profile cleanup failed:", err)
    }
  }
  void run()
  const timer = setInterval(() => void run(), DAY_MS)
  timer.unref()
  return () => clearInterval(timer)
}

/**
 * Select and initialize the persistence backends. Precedence: `DATABASE_URL`
 * (Postgres, both stores) beats the filesystem knobs `MCP_PROFILE_DIR`/
 * `MCP_DASHBOARD_DIR`, which beat the in-memory defaults. With Postgres the
 * pending migrations run here, before the server starts listening — the
 * container/Fly healthcheck grace periods (15–30s) comfortably cover the two
 * small tables.
 */
export async function initRuntime(env: NodeJS.ProcessEnv = process.env): Promise<RuntimeBackends> {
  warnIgnoredRedisUrl(env)
  const databaseUrl = env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    const profileStore = createDefaultProfileStore(env)
    const stopCleanup = startSessionCleanup(profileStore, env)
    return {
      profileStore,
      dashboardStore: env.MCP_DASHBOARD_DIR
        ? createFileSystemDashboardStore({ dir: env.MCP_DASHBOARD_DIR })
        : undefined,
      shutdown: async () => {
        stopCleanup()
      },
    }
  }

  if (env.MCP_PROFILE_DIR || env.MCP_DASHBOARD_DIR) {
    console.warn(
      "[miragon-ai] DATABASE_URL is set — ignoring MCP_PROFILE_DIR/MCP_DASHBOARD_DIR; profiles and dashboards persist to Postgres.",
    )
  }

  const sql = createSql(databaseUrl)
  const applied = await runMigrations(sql, [
    ...PROFILE_STORE_MIGRATIONS,
    ...DASHBOARD_STORE_MIGRATIONS,
  ])
  if (applied.length > 0) {
    console.log(`[miragon-ai] applied database migrations: ${applied.join(", ")}`)
  }
  console.log("[miragon-ai] profile + dashboard stores: postgres")

  const profileStore = createPostgresProfileStore({ sql })
  const stopCleanup = startSessionCleanup(profileStore, env)
  return {
    profileStore,
    dashboardStore: createPostgresDashboardStore({ sql }),
    shutdown: async () => {
      stopCleanup()
      await sql.end({ timeout: 5 })
    },
  }
}
