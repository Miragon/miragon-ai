import type postgres from "postgres"

/**
 * The Postgres infrastructure shared by every store in this package: the one
 * place a postgres.js client is constructed, plus the migration runner that
 * executes the DDL each store exports (`PROFILE_STORE_MIGRATIONS`,
 * `DASHBOARD_STORE_MIGRATIONS`). A composed server that persists to Postgres
 * needs both — exporting the migration arrays without the runner would force
 * every consumer to copy it.
 */

/**
 * Connections are lazy (opened on first query), so booting with an unreachable
 * database only fails once something actually touches a store — and reconnects
 * after a scale-to-zero wake need no extra handling.
 *
 * The driver is loaded through a DYNAMIC import and every other reference in
 * this package is `import type` — deliberately, and the reason this function
 * is async: `postgres` is an OPTIONAL peer dependency, but `/server`
 * re-exports this module, so a static import would execute on every consumer's
 * boot and crash the ones that persist to disk or memory (the composed-server
 * template installs no `postgres`) with ERR_MODULE_NOT_FOUND. Never "simplify"
 * it back to a top-level import.
 */
export async function createSql(databaseUrl: string): Promise<postgres.Sql> {
  const { default: postgres } = await import("postgres")
  return postgres(databaseUrl, {
    // A handful of connections is plenty: every store call is a single short
    // statement or one SELECT…FOR UPDATE transaction.
    max: 5,
    idle_timeout: 30,
    connect_timeout: 10,
    // NOTICEs (e.g. from CREATE TABLE IF NOT EXISTS) are noise on the server log.
    onnotice: () => {},
  })
}

/**
 * One named, append-only migration. Statements are plain SQL strings compiled
 * into the bundle — .sql files would not survive a `pnpm deploy` + dist-copy
 * packaging. Store owners export their own migrations; the composition root
 * concatenates them in a fixed order.
 *
 * `name` is the identity recorded in `schema_migrations`, so it is a permanent
 * key, not a label: renaming one re-runs it against every existing database
 * (harmless only because the shipped DDL is `IF NOT EXISTS`), and reusing a
 * name for different DDL silently skips it. Numeric prefixes are ordering
 * hints for readers only — the array order decides.
 */
export interface Migration {
  name: string
  statements: readonly string[]
}

// Arbitrary but stable app-wide key ("mira" in hex) for the boot-time advisory
// lock — it serializes concurrently booting instances, not tables.
const MIGRATION_LOCK_KEY = 0x6d697261

/**
 * Apply all not-yet-applied migrations in order, tracked by name in
 * `schema_migrations`. Runs as a single transaction under
 * `pg_advisory_xact_lock`, so two instances booting against the same database
 * cannot interleave DDL; the lock releases with the commit. Returns the names
 * that were newly applied (for boot logging).
 */
export async function runMigrations(
  sql: postgres.Sql,
  migrations: readonly Migration[],
): Promise<string[]> {
  return await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`
    await tx.unsafe(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
    )
    const appliedRows = await tx<{ name: string }[]>`SELECT name FROM schema_migrations`
    const applied = new Set(appliedRows.map((row) => row.name))
    const newlyApplied: string[] = []
    for (const migration of migrations) {
      if (applied.has(migration.name)) continue
      for (const statement of migration.statements) {
        await tx.unsafe(statement)
      }
      await tx`INSERT INTO schema_migrations (name) VALUES (${migration.name})`
      newlyApplied.push(migration.name)
    }
    return newlyApplied
  })
}
