import type postgres from "postgres"
import { ANONYMOUS_PROFILE_KEY } from "@miragon-ai/widget-shell/server"
import { parseStoredProfile } from "./profile-migrations.js"
import type { UserProfile } from "./profile-schema.js"
import { mergeProfile, type ProfileStore } from "./profile-store.js"

/**
 * DDL owned by this store, executed by the server app's migration runner
 * (which tracks applied names in its `schema_migrations` table). The full
 * profile record lives in one JSONB column — it is tiny (<1 KB) and its shape
 * is governed by `userProfileSchema`/`schemaVersion`, not by table columns.
 * `user_id` is mirrored out for the future session→user migration once auth
 * lands (see `resolveProfileKey`).
 */
export const PROFILE_STORE_MIGRATIONS: ReadonlyArray<{
  name: string
  statements: readonly string[]
}> = [
  {
    name: "001_user_profiles",
    statements: [
      `CREATE TABLE IF NOT EXISTS user_profiles (
        key TEXT PRIMARY KEY,
        user_id TEXT,
        profile JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
    ],
  },
]

/**
 * Profiles stored one row per key in the `user_profiles` table. Selected when
 * `DATABASE_URL` is set (see the server app's persistence wiring); the caller
 * owns the `sql` client's lifecycle, so this package carries no runtime
 * dependency on the driver.
 *
 * Reads keep the filesystem store's fail-soft semantics: a row whose JSONB
 * fails `userProfileSchema` is treated as "no record" and the next save
 * overwrites it. Saves run the shared `mergeProfile` inside a
 * `SELECT … FOR UPDATE` transaction, so concurrent partial updates of the same
 * key serialize instead of losing fields — safe for multiple server instances
 * sharing one database.
 */
export function createPostgresProfileStore(options: { sql: postgres.Sql }): ProfileStore {
  const { sql } = options

  // Version upgrades + schema validation are shared with the filesystem store
  // via `parseStoredProfile` — older rows migrate on read, newer/corrupt rows
  // read as absent.
  const parseRow = (row: { profile: unknown } | undefined): UserProfile | undefined =>
    row ? parseStoredProfile(row.profile) : undefined

  return {
    async get(key) {
      const rows = await sql<{ profile: unknown }[]>`
        SELECT profile FROM user_profiles WHERE key = ${key}
      `
      return parseRow(rows[0])
    },
    async save(key, input, opts) {
      return await sql.begin(async (tx) => {
        // Advisory lock, not just SELECT…FOR UPDATE: a row that doesn't exist
        // yet cannot be row-locked, so two concurrent FIRST saves of the same
        // key would otherwise both merge over defaults and the second upsert
        // would silently drop the first one's fields. The per-key transaction
        // lock serializes creates and updates alike (same primitive as the
        // app's migration runner).
        await tx`SELECT pg_advisory_xact_lock(hashtextextended('user_profiles:' || ${key}, 0))`
        const rows = await tx<{ profile: unknown }[]>`
          SELECT profile FROM user_profiles WHERE key = ${key} FOR UPDATE
        `
        const record = mergeProfile(key, parseRow(rows[0]), input, new Date().toISOString(), opts)
        // sql.json, not JSON.stringify: postgres.js serializes parameters by
        // the server-described type, and the jsonb serializer stringifies
        // itself — a pre-stringified value gets double-encoded into a jsonb
        // string scalar.
        await tx`
          INSERT INTO user_profiles (key, user_id, profile, updated_at)
          VALUES (
            ${key},
            ${record.userId ?? null},
            ${tx.json(record as unknown as postgres.JSONValue)},
            ${record.updatedAt}
          )
          ON CONFLICT (key) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            profile = EXCLUDED.profile,
            updated_at = EXCLUDED.updated_at
        `
        return record
      })
    },
    async delete(key) {
      const result = await sql`DELETE FROM user_profiles WHERE key = ${key}`
      return result.count > 0
    },
    async cleanupSessions(olderThan) {
      // Session-keyed rows only: `user_id` is stamped by the save path when
      // the request carried an authenticated user, so user-bound records and
      // the shared anonymous record never expire. Predicate mirrors
      // `isExpiredSessionRecord` (SQL side of the same rule) — hence the
      // constant, not a literal, so the two can't drift apart.
      const result = await sql`
        DELETE FROM user_profiles
        WHERE user_id IS NULL
          AND key <> ${ANONYMOUS_PROFILE_KEY}
          AND updated_at < ${olderThan}
      `
      return result.count
    },
  }
}
