import { createFileSystemDashboardStore } from "@miragon/mcp-toolkit-core/tools"
import type { DashboardStore } from "@miragon/mcp-toolkit-core/tools"
import {
  announcePersistence,
  createPostgresDashboardStore,
  createPostgresProfileStore,
  createSql,
  DASHBOARD_STORE_MIGRATIONS,
  persistenceFromEnv,
  postgresReadinessCheck,
  PROFILE_STORE_MIGRATIONS,
  profileStoreFromEnv,
  runMigrations,
  type PersistenceSelection,
  type ProfileStore,
  type ReadinessCheck,
} from "@miragon-ai/widget-shell/server"

/**
 * Everything the composition root wires that depends on the deployment's
 * persistence choice. `initRuntime` below is the ONLY place environment
 * variables are translated into backend selections — a customer packaging
 * that needs a different mix (other database) either sets different env vars
 * or replaces this one module. The backends themselves are NOT app code: the
 * Postgres client, the migration runner and both Postgres stores live in
 * `@miragon-ai/widget-shell/server`, so a composed server gets the same
 * persistence by importing them instead of forking this file.
 */
export interface RuntimeBackends {
  profileStore: ProfileStore
  /** `undefined` lets the toolkit fall back to its in-memory default. */
  dashboardStore: DashboardStore | undefined
  /** Closes owned resources (DB pool); wired to SIGTERM/SIGINT in index.ts. */
  shutdown(): Promise<void>
  /**
   * What `/health/ready` verifies: the store dependencies THIS deployment
   * has (the database when Postgres is selected; nothing for the file/memory
   * stores — a missing directory fails loudly at the first save instead).
   */
  readiness: Record<string, ReadinessCheck>
}

/**
 * The non-database profile store selection — the shared `profileStoreFromEnv`
 * (filesystem when `MCP_PROFILE_DIR` is set, in-memory otherwise). Also the
 * default `setup.ts` falls back to when `getPlugins()` is called without an
 * explicit store (tests), so the selection logic exists exactly once.
 */
export function createDefaultProfileStore(env: NodeJS.ProcessEnv = process.env): ProfileStore {
  return profileStoreFromEnv(env)
}

/** What the boot that consumes the backends actually keeps. */
export interface InitRuntimeOptions {
  /**
   * Whether the toolkit's dashboard builder is registered
   * (`frameworkWritesAllowed`) — without it no dashboard is ever saved, so
   * the dashboard store stays out of the announcement. Default `true`.
   */
  dashboards?: boolean
}

/** The selected backends, logged on every path; volatile ones warn in production. */
function announce(
  { profiles, dashboards }: Required<PersistenceSelection>,
  env: NodeJS.ProcessEnv,
  options: InitRuntimeOptions,
): void {
  announcePersistence(
    { profiles, ...(options.dashboards === false ? {} : { dashboards }) },
    {
      env,
      label: "miragon-ai",
      remedy:
        "Set DATABASE_URL (Postgres, both stores), or MCP_PROFILE_DIR / MCP_DASHBOARD_DIR to directories on a persistent volume.",
    },
  )
}

/**
 * Select and initialize the persistence backends. Precedence: `DATABASE_URL`
 * (Postgres, both stores) beats the filesystem knobs `MCP_PROFILE_DIR`/
 * `MCP_DASHBOARD_DIR`, which beat the in-memory defaults. Every path logs its
 * selection; a `NODE_ENV=production` boot that keeps a store in memory warns
 * loudly (`announcePersistence`) — but still boots. With Postgres the
 * pending migrations run here, before the server starts listening — the
 * container/Fly healthcheck grace periods (15–30s) comfortably cover the two
 * small tables.
 */
export async function initRuntime(
  env: NodeJS.ProcessEnv = process.env,
  options: InitRuntimeOptions = {},
): Promise<RuntimeBackends> {
  const databaseUrl = env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    announce(persistenceFromEnv(env), env, options)
    return {
      profileStore: createDefaultProfileStore(env),
      dashboardStore: env.MCP_DASHBOARD_DIR
        ? createFileSystemDashboardStore({ dir: env.MCP_DASHBOARD_DIR })
        : undefined,
      shutdown: () => Promise.resolve(),
      readiness: {},
    }
  }

  if (env.MCP_PROFILE_DIR || env.MCP_DASHBOARD_DIR) {
    console.warn(
      "[miragon-ai] DATABASE_URL is set — ignoring MCP_PROFILE_DIR/MCP_DASHBOARD_DIR; profiles and dashboards persist to Postgres.",
    )
  }

  const sql = await createSql(databaseUrl)
  let applied: string[]
  try {
    applied = await runMigrations(sql, [...PROFILE_STORE_MIGRATIONS, ...DASHBOARD_STORE_MIGRATIONS])
  } catch (error) {
    // The boot fails here, so nothing else will ever end this client: close
    // it, or its open connections keep the failing process (and the
    // database sessions) alive. The migration error is what the operator
    // needs — a failing close must not replace it.
    await sql.end({ timeout: 5 }).catch(() => {})
    throw error
  }
  if (applied.length > 0) {
    console.log(`[miragon-ai] applied database migrations: ${applied.join(", ")}`)
  }
  announce({ profiles: "postgres", dashboards: "postgres" }, env, options)

  return {
    profileStore: createPostgresProfileStore({ sql }),
    dashboardStore: createPostgresDashboardStore({ sql, label: "miragon-ai" }),
    shutdown: () => sql.end({ timeout: 5 }),
    readiness: { database: postgresReadinessCheck(sql) },
  }
}
