import { randomUUID } from "node:crypto"
import {
  DASHBOARD_SCHEMA_VERSION,
  DashboardOwnershipError,
  DashboardUnreadableError,
  isDashboardOwnedBy,
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
 * needs no migration here. `user_id`/`updated_at` are mirrored out so `list`
 * can filter by owner and sort in SQL, and so a row whose JSONB this build
 * cannot read still has an owner and a timestamp.
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

interface DashboardRow {
  id: string
  user_id: string | null
  record: unknown
  updated_at: Date
}

/** A row as this build sees it: the toolkit's readable/unreadable split. */
type StoredDashboard =
  | { state: "readable"; record: DashboardRecord }
  | { state: "unreadable"; id: string; reason: string; ownerId?: string; updatedAt: string }

function classifyRow(row: DashboardRow): StoredDashboard {
  const record = parseDashboardRecord(row.record)
  if (record) return { state: "readable", record }
  const payload: { schemaVersion?: unknown } =
    typeof row.record === "object" && row.record !== null ? row.record : {}
  const version = payload.schemaVersion
  return {
    state: "unreadable",
    id: row.id,
    // The toolkit's wording, so both stores report the same reasons.
    reason:
      typeof version === "number" && version > DASHBOARD_SCHEMA_VERSION
        ? `written by a newer schemaVersion ${version} (this build reads up to ${DASHBOARD_SCHEMA_VERSION})`
        : "does not match the current record schema",
    // The mirrored column is written in the same statement as the record, so
    // it still attributes the row when the payload is unreadable.
    ...(row.user_id === null ? {} : { ownerId: row.user_id }),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

/** Whose row it is: the payload's owner when readable, else the mirrored column's. */
function ownerOf(stored: StoredDashboard): string | undefined {
  return stored.state === "readable" ? stored.record.userId : stored.ownerId
}

function toSummary(stored: StoredDashboard): DashboardSummary {
  if (stored.state === "unreadable") {
    return {
      id: stored.id,
      name: stored.id,
      ...(stored.ownerId === undefined ? {} : { userId: stored.ownerId }),
      updatedAt: stored.updatedAt,
      unreadable: stored.reason,
    }
  }
  const { record } = stored
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    title: record.title,
    userId: record.userId,
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
 * Ownership is the toolkit's rule, never re-derived here: `isDashboardOwnedBy`
 * decides visibility (no caller id = global scope; an identified caller owns
 * exactly the records stamped with its id, and an owner-less record is not
 * one of them), and `resolveSavedRecord` enforces it on updates. A row whose
 * JSONB fails `parseDashboardRecord` (corrupt, or written by a newer build) is
 * a conflict, never "absent": `get`/`save`/`delete` reject with
 * `DashboardUnreadableError` for a caller it belongs to, `list` reports it with
 * `unreadable`, and the row stays in place — so a save can never overwrite it
 * and hand it a new owner.
 */
export function createPostgresDashboardStore(options: {
  sql: postgres.Sql
  label?: string
}): DashboardStore {
  const { sql, label = "dashboard-store" } = options

  const classify = (row: DashboardRow): StoredDashboard => {
    const stored = classifyRow(row)
    if (stored.state === "unreadable") {
      console.warn(`[${label}] Dashboard "${row.id}" is unreadable: ${stored.reason}.`)
    }
    return stored
  }

  /**
   * The caller's view of an addressed row: `undefined` when it is absent or
   * not the caller's, the record when readable, and a thrown
   * `DashboardUnreadableError` when it is the caller's but unreadable.
   */
  const ownRecord = (
    row: DashboardRow | undefined,
    userId: string | undefined,
  ): DashboardRecord | undefined => {
    if (!row) return undefined
    const stored = classify(row)
    if (!isDashboardOwnedBy(ownerOf(stored), userId)) return undefined
    if (stored.state === "unreadable") throw new DashboardUnreadableError(row.id, stored.reason)
    return stored.record
  }

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
          ? await tx<DashboardRow[]>`
              SELECT id, user_id, record, updated_at FROM dashboards
              WHERE id = ${input.id} FOR UPDATE
            `
          : []
        const stored = rows[0] ? classify(rows[0]) : undefined
        if (stored?.state === "unreadable") {
          if (!isDashboardOwnedBy(stored.ownerId, input.userId)) {
            throw new DashboardOwnershipError(
              stored.ownerId
                ? `Access denied: dashboard "${stored.id}" is owned by another user.`
                : `Access denied: dashboard "${stored.id}" has no owner; an owner-less (global-scope) dashboard is not writable by an identified caller.`,
            )
          }
          throw new DashboardUnreadableError(stored.id, stored.reason)
        }
        const now = new Date().toISOString()
        // resolveSavedRecord returns null for a create and throws
        // DashboardOwnershipError when an update would touch a record the
        // caller doesn't own (another user's, or an owner-less one) — both
        // semantics come straight from the toolkit.
        const record: DashboardRecord = resolveSavedRecord(stored?.record, input, now) ?? {
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
        ? await sql<DashboardRow[]>`
            SELECT id, user_id, record, updated_at FROM dashboards
            WHERE user_id = ${filter.userId}
            ORDER BY updated_at DESC
          `
        : await sql<DashboardRow[]>`
            SELECT id, user_id, record, updated_at FROM dashboards
            ORDER BY updated_at DESC
          `
      // The SQL predicate is the fast path, `isDashboardOwnedBy` the authority
      // — in case the mirrored user_id column ever diverges from the payload.
      return rows
        .map(classify)
        .filter((stored) => isDashboardOwnedBy(ownerOf(stored), filter.userId))
        .map(toSummary)
    },
    async get(id, filter) {
      const rows = await sql<DashboardRow[]>`
        SELECT id, user_id, record, updated_at FROM dashboards WHERE id = ${id}
      `
      return ownRecord(rows[0], filter.userId)
    },
    async delete(id, filter) {
      return await sql.begin(async (tx) => {
        const rows = await tx<DashboardRow[]>`
          SELECT id, user_id, record, updated_at FROM dashboards WHERE id = ${id} FOR UPDATE
        `
        if (!ownRecord(rows[0], filter.userId)) return false
        await tx`DELETE FROM dashboards WHERE id = ${id}`
        return true
      })
    },
  }
}
