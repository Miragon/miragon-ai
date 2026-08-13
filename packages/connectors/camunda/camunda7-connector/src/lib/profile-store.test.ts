import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import postgres from "postgres"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ANONYMOUS_PROFILE_KEY } from "@miragon-ai/widget-shell/server"
import {
  createFileSystemProfileStore,
  createInMemoryProfileStore,
  type ProfileStore,
} from "./profile-store.js"
import { createPostgresProfileStore, PROFILE_STORE_MIGRATIONS } from "./profile-store-postgres.js"
import {
  defaultUserProfile,
  userProfilePreferencesSchema,
  userProfileToolSaveInput,
} from "./profile-schema.js"

describe("defaultUserProfile", () => {
  it("returns a complete, defaulted profile for an unsaved key", () => {
    const p = defaultUserProfile("sess-1")
    expect(p).toMatchObject({
      id: "sess-1",
      language: "en",
      theme: "system",
      pinnedDashboardIds: [],
      modules: {},
      schemaVersion: 2,
    })
    expect(p.defaultEngineId).toBeUndefined()
    expect(p.allowedEngineIds).toBeUndefined()
  })

  it("the preferences schema fills every default from an empty object", () => {
    expect(userProfilePreferencesSchema.parse({})).toEqual({
      language: "en",
      theme: "system",
      pinnedDashboardIds: [],
      modules: {},
    })
  })
})

describe("userProfileToolSaveInput", () => {
  // Zod 4 re-applies `.default()`s through `.partial()` — the save input must
  // stay default-free so a single-field save doesn't materialize (and thereby
  // persist) resets of every other preference at the tool boundary.
  it("keeps omitted fields ABSENT instead of materializing defaults", () => {
    expect(userProfileToolSaveInput.parse({ language: "de" })).toEqual({ language: "de" })
    expect(userProfileToolSaveInput.parse({})).toEqual({})
  })
})

/**
 * Behavioral contract every ProfileStore implementation must satisfy — run
 * against each store so the implementations cannot drift apart. `makeStore`
 * must return a store whose keys start out absent.
 */
function profileStoreContract(makeStore: () => Promise<ProfileStore>) {
  it("returns undefined for an unknown key", async () => {
    const store = await makeStore()
    expect(await store.get("missing")).toBeUndefined()
  })

  it("creates, then merges partial updates without wiping other fields", async () => {
    const store = await makeStore()

    const created = await store.save("sess-1", { language: "de", allowedEngineIds: ["prod-a"] })
    expect(created.language).toBe("de")
    expect(created.allowedEngineIds).toEqual(["prod-a"])
    // Untouched fields keep their defaults.
    expect(created.theme).toBe("system")

    // A single-field update must not reset language/allowedEngineIds.
    const updated = await store.save("sess-1", { theme: "dark" })
    expect(updated.theme).toBe("dark")
    expect(updated.language).toBe("de")
    expect(updated.allowedEngineIds).toEqual(["prod-a"])
    // createdAt is preserved across saves; updatedAt advances (or is unchanged).
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.updatedAt >= created.updatedAt).toBe(true)
  })

  it('clears an optional id field when an empty string ("(auto)") is saved', async () => {
    const store = await makeStore()
    await store.save("sess-1", { defaultEngineId: "prod-a" })
    const cleared = await store.save("sess-1", { defaultEngineId: "" })
    expect(cleared.defaultEngineId).toBeUndefined()
  })

  it("merges module slices per namespace without wiping other modules", async () => {
    const store = await makeStore()
    await store.save("sess-1", { modules: { analytics: { defaultPeriod: "30d" } } })
    const updated = await store.save("sess-1", { modules: { other: { flag: true } } })
    expect(updated.modules).toEqual({
      analytics: { defaultPeriod: "30d" },
      other: { flag: true },
    })
    // A save without `modules` leaves all slices untouched.
    const untouched = await store.save("sess-1", { theme: "dark" })
    expect(untouched.modules).toEqual(updated.modules)
  })

  it("deletes a stored profile", async () => {
    const store = await makeStore()
    await store.save("sess-1", { theme: "dark" })
    expect(await store.delete("sess-1")).toBe(true)
    expect(await store.get("sess-1")).toBeUndefined()
    expect(await store.delete("sess-1")).toBe(false)
  })

  it("survives two concurrent saves of the same key (last-write-wins, no error)", async () => {
    const store = await makeStore()
    // The settings page has two independent save buttons — overlapping saves
    // must both complete (per-call tmp files on the filesystem store).
    await Promise.all([
      store.save("sess-1", { theme: "dark" }),
      store.save("sess-1", { language: "de" }),
    ])
    expect(await store.get("sess-1")).toBeDefined()
  })

  it("stamps the auth user id and never demotes the record on later keyless saves", async () => {
    const store = await makeStore()
    const created = await store.save("user-1", { language: "de" }, { userId: "user-1" })
    expect(created.userId).toBe("user-1")
    const updated = await store.save("user-1", { theme: "dark" })
    expect(updated.userId).toBe("user-1")
  })

  it("cleanupSessions expires only session-keyed records (never anonymous or user-bound)", async () => {
    const store = await makeStore()
    await store.save("sess-1", { theme: "dark" })
    // The constant, not the literal: every implementation must exempt the same
    // key, so a value change has to fail the SQL and the in-process stores alike.
    await store.save(ANONYMOUS_PROFILE_KEY, { language: "de" })
    await store.save("user-1", { theme: "dark" }, { userId: "user-1" })

    // Future cutoff → every session record is old enough; scope must still hold.
    const removed = await store.cleanupSessions(new Date(Date.now() + 60_000))
    expect(removed).toBe(1)
    expect(await store.get("sess-1")).toBeUndefined()
    expect(await store.get(ANONYMOUS_PROFILE_KEY)).toBeDefined()
    expect((await store.get("user-1"))?.userId).toBe("user-1")

    // Epoch cutoff → nothing is old enough.
    await store.save("sess-2", { theme: "light" })
    expect(await store.cleanupSessions(new Date(0))).toBe(0)
    expect(await store.get("sess-2")).toBeDefined()
  })
}

describe("createInMemoryProfileStore", () => {
  profileStoreContract(() => Promise.resolve(createInMemoryProfileStore()))
})

describe("createFileSystemProfileStore", () => {
  profileStoreContract(async () =>
    createFileSystemProfileStore({ dir: await mkdtemp(path.join(tmpdir(), "profile-store-")) }),
  )

  it("upgrades a persisted v1 record on read (flat analytics fields → modules.analytics)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "profile-store-"))
    const store = createFileSystemProfileStore({ dir })
    await writeFile(path.join(dir, "legacy.json"), JSON.stringify(V1_RECORD), "utf-8")

    const migrated = await store.get("legacy")
    expect(migrated).toMatchObject({
      language: "de",
      theme: "dark",
      schemaVersion: 2,
      modules: { analytics: { defaultPeriod: "30d", minBucketSize: 25 } },
    })
    expect(migrated).not.toHaveProperty("analyticsDefaultPeriod")
  })

  it("treats a record written by a NEWER build as absent instead of mangling it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "profile-store-"))
    const store = createFileSystemProfileStore({ dir })
    await writeFile(
      path.join(dir, "future.json"),
      JSON.stringify({ ...V1_RECORD, schemaVersion: 99 }),
      "utf-8",
    )
    expect(await store.get("future")).toBeUndefined()
  })
})

/** A realistic record as the v1 build persisted it (flat analytics fields). */
const V1_RECORD = {
  id: "legacy",
  language: "de",
  theme: "dark",
  pinnedDashboardIds: [],
  analyticsDefaultPeriod: "30d",
  analyticsMinBucketSize: 25,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  schemaVersion: 1,
}

// Opt-in integration slice (like test:host): needs a reachable Postgres, so it
// only runs when TEST_DATABASE_URL is set — `pnpm test:pg` at the repo root
// points it at the compose stack's dedicated test database. An own schema
// isolates it from the app package's suite sharing that database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const TEST_SCHEMA = "mcp_camunda7_profile_store_test"

describe.skipIf(!TEST_DATABASE_URL)("createPostgresProfileStore", () => {
  let sql: postgres.Sql

  beforeAll(async () => {
    sql = postgres(TEST_DATABASE_URL!, {
      max: 2,
      onnotice: () => {},
      connection: { search_path: TEST_SCHEMA },
    })
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await sql.unsafe(`CREATE SCHEMA ${TEST_SCHEMA}`)
    for (const migration of PROFILE_STORE_MIGRATIONS) {
      for (const statement of migration.statements) {
        await sql.unsafe(statement)
      }
    }
  })

  beforeEach(async () => {
    await sql`DELETE FROM user_profiles`
  })

  afterAll(async () => {
    await sql.end({ timeout: 5 })
  })

  profileStoreContract(() => Promise.resolve(createPostgresProfileStore({ sql })))

  it("treats a corrupt row as absent and overwrites it on the next save", async () => {
    const store = createPostgresProfileStore({ sql })
    await sql`
      INSERT INTO user_profiles (key, profile)
      VALUES ('sess-corrupt', '{"schemaVersion": 999}'::jsonb)
    `
    expect(await store.get("sess-corrupt")).toBeUndefined()

    const saved = await store.save("sess-corrupt", { theme: "dark" })
    expect(saved.theme).toBe("dark")
    // Merged over defaults, not over the corrupt garbage.
    expect(saved.language).toBe("en")
    expect(await store.get("sess-corrupt")).toEqual(saved)
  })

  it("upgrades a v1 row on read (flat analytics fields → modules.analytics)", async () => {
    const store = createPostgresProfileStore({ sql })
    await sql`
      INSERT INTO user_profiles (key, profile)
      VALUES ('legacy', ${sql.json(V1_RECORD)})
    `
    const migrated = await store.get("legacy")
    expect(migrated).toMatchObject({
      language: "de",
      schemaVersion: 2,
      modules: { analytics: { defaultPeriod: "30d", minBucketSize: 25 } },
    })
  })

  it("merges concurrent partial saves of the same key without losing fields", async () => {
    const store = createPostgresProfileStore({ sql })
    // SELECT…FOR UPDATE serializes the two transactions; whichever commits
    // second merges over the first's row, so neither field may get lost.
    await Promise.all([
      store.save("sess-1", { theme: "dark" }),
      store.save("sess-1", { language: "de" }),
    ])
    const profile = await store.get("sess-1")
    expect(profile?.theme).toBe("dark")
    expect(profile?.language).toBe("de")
  })
})
