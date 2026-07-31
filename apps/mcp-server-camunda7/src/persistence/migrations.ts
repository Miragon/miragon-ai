import type postgres from "postgres"

/**
 * One named, append-only migration. Statements are plain SQL strings compiled
 * into the bundle — .sql files would not survive the Dockerfile's
 * `pnpm deploy` + dist-copy packaging. Store owners export their own
 * migrations (e.g. `PROFILE_STORE_MIGRATIONS`); the app concatenates them in
 * a fixed order in `initRuntime`.
 */
export interface Migration {
  name: string
  statements: readonly string[]
}

// Arbitrary but stable app-wide key ("mira" in hex) for the boot-time
// advisory lock — it serializes concurrently booting instances, not tables.
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
