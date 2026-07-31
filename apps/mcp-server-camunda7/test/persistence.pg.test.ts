import postgres from "postgres"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { DashboardOwnershipError } from "@miragon/mcp-toolkit-core/tools"
import type { DashboardStore } from "@miragon/mcp-toolkit-core/tools"
import { PROFILE_STORE_MIGRATIONS } from "@miragon-ai/mcp-camunda7"
import {
  createPostgresDashboardStore,
  DASHBOARD_STORE_MIGRATIONS,
} from "../src/persistence/dashboard-store-postgres.js"
import { runMigrations } from "../src/persistence/migrations.js"

const LAYOUT = [{ row: [{ widget: "shell:kpi-grid" }] }]

/** updatedAt has millisecond precision — space writes out for stable ordering. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 10))

// Opt-in integration slice (like test:host): needs a reachable Postgres, so it
// only runs when TEST_DATABASE_URL is set — `pnpm test:pg` at the repo root
// points it at the compose stack's dedicated test database. An own schema
// isolates it from the mcp-camunda7 suite sharing that database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const TEST_SCHEMA = "mcp_server_persistence_test"

describe.skipIf(!TEST_DATABASE_URL)("postgres persistence", () => {
  let sql: postgres.Sql

  beforeAll(async () => {
    sql = postgres(TEST_DATABASE_URL!, {
      max: 2,
      onnotice: () => {},
      connection: { search_path: TEST_SCHEMA },
    })
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await sql.unsafe(`CREATE SCHEMA ${TEST_SCHEMA}`)
  })

  afterAll(async () => {
    await sql.end({ timeout: 5 })
  })

  // Runs first (single-file describes execute in order) and doubles as the
  // table setup for the store tests below — the exact boot sequence of
  // initRuntime.
  describe("runMigrations", () => {
    it("applies pending migrations in order and records them by name", async () => {
      const applied = await runMigrations(sql, [
        ...PROFILE_STORE_MIGRATIONS,
        ...DASHBOARD_STORE_MIGRATIONS,
      ])
      expect(applied).toEqual(["001_user_profiles", "002_dashboards"])
      // The created tables are actually usable.
      const rows = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM dashboards`
      expect(rows[0].n).toBe(0)
    })

    it("is idempotent on a second run", async () => {
      const applied = await runMigrations(sql, [
        ...PROFILE_STORE_MIGRATIONS,
        ...DASHBOARD_STORE_MIGRATIONS,
      ])
      expect(applied).toEqual([])
    })
  })

  describe("createPostgresDashboardStore", () => {
    let store: DashboardStore

    beforeAll(() => {
      store = createPostgresDashboardStore({ sql })
    })

    beforeEach(async () => {
      await sql`DELETE FROM dashboards`
    })

    it("creates a record with generated id and server-managed metadata", async () => {
      const record = await store.save({ name: "ops", layout: LAYOUT })
      expect(record.id).toBeTruthy()
      expect(record.schemaVersion).toBe(1)
      expect(record.createdAt).toBe(record.updatedAt)
      expect(await store.get(record.id, {})).toEqual(record)
    })

    it("updates by id, preserving createdAt and advancing updatedAt", async () => {
      const created = await store.save({ name: "ops", layout: LAYOUT })
      await tick()
      const updated = await store.save({ id: created.id, name: "renamed", layout: LAYOUT })
      expect(updated.id).toBe(created.id)
      expect(updated.name).toBe("renamed")
      expect(updated.createdAt).toBe(created.createdAt)
      expect(updated.updatedAt > created.updatedAt).toBe(true)
    })

    it("rejects a foreign update and never reassigns the owner", async () => {
      const alices = await store.save({ name: "alice's", layout: LAYOUT, userId: "alice" })
      await expect(
        store.save({ id: alices.id, name: "stolen", layout: LAYOUT, userId: "bob" }),
      ).rejects.toBeInstanceOf(DashboardOwnershipError)

      // A global record (no owner) stays writable by anyone — and the write
      // must not adopt the writer as owner.
      const global = await store.save({ name: "global", layout: LAYOUT })
      const written = await store.save({
        id: global.id,
        name: "edited",
        layout: LAYOUT,
        userId: "bob",
      })
      expect(written.userId).toBeUndefined()
    })

    it("enforces ownership on get and delete", async () => {
      const alices = await store.save({ name: "alice's", layout: LAYOUT, userId: "alice" })
      expect(await store.get(alices.id, { userId: "bob" })).toBeUndefined()
      expect(await store.delete(alices.id, { userId: "bob" })).toBe(false)
      expect(await store.delete(alices.id, { userId: "alice" })).toBe(true)
      expect(await store.get(alices.id, {})).toBeUndefined()
    })

    it("lists own + global records as summaries, newest first", async () => {
      await store.save({ name: "global", layout: LAYOUT })
      await tick()
      await store.save({ name: "alice's", layout: LAYOUT, userId: "alice" })
      await tick()
      await store.save({ name: "bob's", layout: LAYOUT, userId: "bob" })

      const forAlice = await store.list({ userId: "alice" })
      expect(forAlice.map((s) => s.name)).toEqual(["alice's", "global"])
      // Summary shape: no layout/steps/keys payload.
      expect(Object.keys(forAlice[0]).sort()).toEqual([
        "description",
        "id",
        "name",
        "title",
        "updatedAt",
      ])

      const unfiltered = await store.list({})
      expect(unfiltered.map((s) => s.name)).toEqual(["bob's", "alice's", "global"])
    })

    it("fail-soft skips corrupt rows on read paths and leaves them in place", async () => {
      await sql`
        INSERT INTO dashboards (id, record, updated_at)
        VALUES ('corrupt', '{"name": "no layout"}'::jsonb, now())
      `
      expect(await store.list({})).toEqual([])
      expect(await store.get("corrupt", {})).toBeUndefined()
      expect(await store.delete("corrupt", {})).toBe(false)
      const rows = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM dashboards`
      expect(rows[0].n).toBe(1)
    })
  })
})
