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
import type { Migration } from "./migrations.js"

/**
 * DDL owned by this store, executed by `runMigrations`. Like the profile
 * table, the full record lives in one JSONB column (layout/steps/keys are
 * arbitrarily nested `render-view` input, not relationally decomposable);
 * `user_id`/`updated_at` are mirrored out for the ownership filter and the
 * `list` ordering.
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
 * `frameworkOptions.app.dashboardStore`). Ownership enforcement is delegated
 * to the toolkit's `resolveSavedRecord`; writes run inside `SELECT … FOR
 * UPDATE` transactions so the read-check-write sequences (save merge, delete
 * ownership check) stay atomic across multiple server instances.
 */
export function createPostgresDashboardStore(options: { sql: postgres.Sql }): DashboardStore {
  const { sql } = options

  const parseRow = (row: { record: unknown } | undefined): DashboardRecord | undefined =>
    row ? parseDashboardRecord(row.record) : undefined

  return {
    async save(input) {
      return await sql.begin(async (tx) => {
        const rows = input.id
          ? await tx<{ record: unknown }[]>`
              SELECT record FROM dashboards WHERE id = ${input.id} FOR UPDATE
            `
          : []
        const now = new Date().toISOString()
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
      // Ordering on the mirrored timestamptz column matches the toolkit's
      // ISO-string sort; rows failing the read gate are skipped fail-soft.
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
        const record = parseDashboardRecord(row.record)
        return record ? [toSummary(record)] : []
      })
    },
    async get(id, filter) {
      const rows = await sql<{ record: unknown }[]>`
        SELECT record FROM dashboards WHERE id = ${id}
      `
      const record = parseRow(rows[0])
      if (!record) return undefined
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
