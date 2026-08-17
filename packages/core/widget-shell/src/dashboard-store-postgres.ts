import { randomUUID } from "node:crypto"
import {
  DASHBOARD_SCHEMA_VERSION,
  parseDashboardRecord,
  resolveSavedRecord,
} from "@miragon/mcp-toolkit-core/tools"
import type {
  DashboardRecord,
  DashboardStore,
  DashboardSummary,
} from "@miragon/mcp-toolkit-core/tools"
import type postgres from "postgres"
import type { Migration } from "./postgres.js"

/**
 * DDL owned by this store, executed by `runMigrations`. Like the profile
 * table, the full record lives in one JSONB column (layout/steps/keys are
 * arbitrarily nested `render-view` input, not relationally decomposable) whose
 * shape is governed by the toolkit's `parseDashboardRecord`/
 * `DASHBOARD_SCHEMA_VERSION` — a toolkit upgrade that adds a layout field
 * needs no migration here. `user_id`/`updated_at` are mirrored out purely so
 * `list` can filter by owner and sort in SQL.
 *
 * The `002_` prefix is historical (it shipped after `001_user_profiles` in the
 * stock app) and stays: the name is the key recorded in `schema_migrations` on
 * every existing database, so renaming it would re-run the DDL there. A server
 * that persists dashboards WITHOUT profiles simply has no `001_`.
 */
export const DASHBOARD_STORE_MIGRATIONS: readonly Migration[] = [
  {
    name: "002_dashboards",
    statements: [
      `CREATE TABLE IF NOT EXISTS dashboards (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        record JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS dashboards_list_idx
        ON dashboards (user_id, updated_at DESC)`,
    ],
  },
]

/** The toolkit's ownership convention: records without a userId are global. */
function ownedBy(record: DashboardRecord, userId: string | undefined): boolean {
  if (!userId) return true
  if (!record.userId) return true
  return record.userId === userId
}

function toSummary(record: DashboardRecord): DashboardSummary {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    title: record.title,
    updatedAt: record.updatedAt,
  }
}

/**
 * Dashboards stored one row per record in the `dashboards` table, implementing
 * the toolkit's `DashboardStore` contract (injected via
 * `frameworkOptions.app.dashboardStore`) — the multi-writer counterpart to the
 * toolkit's filesystem store, whose `save` is documented as racy. Selected
 * next to `createPostgresProfileStore` when the deployment has a
 * `DATABASE_URL`; the caller owns the `sql` client's lifecycle, so this
 * package carries no runtime dependency on the driver.
 *
 * Ownership enforcement is delegated to the toolkit's `resolveSavedRecord`, so
 * this store cannot drift from the filesystem one. Reads keep the filesystem
 * store's fail-soft semantics: a row whose JSONB fails `parseDashboardRecord`
 * (corrupt, or written by a newer build) reads as absent and is skipped in
 * listings — and left in place — instead of taking the whole listing down.
 */
export function createPostgresDashboardStore(options: {
  sql: postgres.Sql
  label?: string
}): DashboardStore {
  const { sql, label = "dashboard-store" } = options

  const parseRow = (row: { record: unknown } | undefined): DashboardRecord | undefined =>
    row ? parseDashboardRecord(row.record) : undefined

  return {
    async save(input) {
      return await sql.begin(async (tx) => {
        // Advisory lock, not just SELECT…FOR UPDATE: a row that does not exist
        // yet cannot be row-locked, so two concurrent FIRST saves of the same
        // id would both see "no existing record", both take the create branch,
        // and the second upsert would overwrite the first (including its
        // createdAt/userId) without ever passing the ownership check. Only
        // reachable when the caller supplies an id — a generated UUID collides
        // with nothing. Same primitive as the profile store's per-key lock.
        if (input.id) {
          await tx`SELECT pg_advisory_xact_lock(hashtextextended('dashboards:' || ${input.id}, 0))`
        }
        const rows = input.id
          ? await tx<{ record: unknown }[]>`
              SELECT record FROM dashboards WHERE id = ${input.id} FOR UPDATE
            `
          : []
        const now = new Date().toISOString()
        // resolveSavedRecord returns null for a create and throws
        // DashboardOwnershipError when an update would touch another user's
        // record — both semantics come straight from the toolkit.
        const record: DashboardRecord = resolveSavedRecord(parseRow(rows[0]), input, now) ?? {
          id: input.id ?? randomUUID(),
          name: input.name,
          description: input.description,
          userId: input.userId,
          keys: input.keys,
          steps: input.steps,
          layout: input.layout,
          title: input.title,
          schemaVersion: DASHBOARD_SCHEMA_VERSION,
          createdAt: now,
          updatedAt: now,
        }
        // sql.json, not JSON.stringify: postgres.js serializes parameters by
        // the server-described type, and the jsonb serializer stringifies
        // itself — a pre-stringified value gets double-encoded into a jsonb
        // string scalar.
        await tx`
          INSERT INTO dashboards (id, user_id, record, updated_at)
          VALUES (
            ${record.id},
            ${record.userId ?? null},
            ${tx.json(record as unknown as postgres.JSONValue)},
            ${record.updatedAt}
          )
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            record = EXCLUDED.record,
            updated_at = EXCLUDED.updated_at
        `
        return record
      })
    },
    async list(filter) {
      // The owner predicate is pushed into SQL so a large table doesn't get
      // read in full; ordering on the mirrored timestamptz column matches the
      // toolkit's ISO-string sort.
      const rows = filter.userId
        ? await sql<{ record: unknown }[]>`
            SELECT record FROM dashboards
            WHERE user_id IS NULL OR user_id = ${filter.userId}
            ORDER BY updated_at DESC
          `
        : await sql<{ record: unknown }[]>`
            SELECT record FROM dashboards ORDER BY updated_at DESC
          `
      return rows.flatMap((row) => {
        const record = parseRow(row)
        if (!record) {
          console.warn(`[${label}] Skipping a dashboard row: does not match the record schema.`)
          return []
        }
        // The SQL predicate is the fast path, `ownedBy` the authority — in case
        // the mirrored user_id column ever diverges from the JSONB payload.
        return ownedBy(record, filter.userId) ? [toSummary(record)] : []
      })
    },
    async get(id, filter) {
      const rows = await sql<{ record: unknown }[]>`
        SELECT record FROM dashboards WHERE id = ${id}
      `
      const record = parseRow(rows[0])
      if (!record) {
        if (rows.length > 0) {
          console.warn(`[${label}] Ignoring dashboard "${id}": does not match the record schema.`)
        }
        return undefined
      }
      if (!ownedBy(record, filter.userId)) return undefined
      return record
    },
    async delete(id, filter) {
      return await sql.begin(async (tx) => {
        const rows = await tx<{ record: unknown }[]>`
          SELECT record FROM dashboards WHERE id = ${id} FOR UPDATE
        `
        const record = parseRow(rows[0])
        // A corrupt row reads as "not present" and is left in place — same
        // fail-soft convention as the toolkit's filesystem store.
        if (!record || !ownedBy(record, filter.userId)) return false
        await tx`DELETE FROM dashboards WHERE id = ${id}`
        return true
      })
    },
  }
}
