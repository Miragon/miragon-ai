import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import postgres from "postgres"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  createFileSystemProfileStore,
  createInMemoryProfileStore,
  type ProfileStore,
} from "./profile-store.js"
import { createPostgresProfileStore, PROFILE_STORE_MIGRATIONS } from "./profile-store-postgres.js"
import { defaultProfileRecord } from "./profile-record.js"
import { saveModuleSlice } from "./profile-slice.js"

describe("defaultProfileRecord", () => {
  it("returns a complete, defaulted record for an unsaved key", () => {
    const p = defaultProfileRecord("sess-1")
    expect(p).toMatchObject({
      id: "sess-1",
      language: "en",
      theme: "system",
      modules: {},
      schemaVersion: 3,
    })
    expect(p.userId).toBeUndefined()
    expect(p.createdAt).toBe(p.updatedAt)
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

    const created = await store.save("sess-1", { language: "de" })
    expect(created.language).toBe("de")
    // Untouched fields keep their defaults.
    expect(created.theme).toBe("system")

    // A single-field update must not reset language.
    const updated = await store.save("sess-1", { theme: "dark" })
    expect(updated.theme).toBe("dark")
    expect(updated.language).toBe("de")
    // createdAt is preserved across saves; updatedAt advances (or is unchanged).
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.updatedAt >= created.updatedAt).toBe(true)
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

  it("merges the saved module slice one level deep, leaving siblings intact", async () => {
    const store = await makeStore()
    await store.save("sess-1", {
      modules: { camunda7: { defaultEngineId: "prod-a" }, analytics: { defaultPeriod: "30d" } },
    })
    const updated = await store.save("sess-1", { modules: { camunda7: { pinned: ["d1"] } } })
    // Per-key one-level MERGE (inside the store's lock, so concurrent saves
    // of disjoint fields in the SAME slice both survive); a field clears via
    // explicit `undefined`, tested below.
    expect(updated.modules).toEqual({
      camunda7: { defaultEngineId: "prod-a", pinned: ["d1"] },
      analytics: { defaultPeriod: "30d" },
    })
  })

  it("clears a slice field via explicit undefined and keeps merging afterwards", async () => {
    const store = await makeStore()
    await store.save("sess-1", {
      modules: { camunda7: { defaultEngineId: "prod-a", pinned: ["d1"] } },
    })
    const cleared = await store.save("sess-1", {
      modules: { camunda7: { defaultEngineId: undefined } },
    })
    expect(cleared.modules?.camunda7).toEqual({ pinned: ["d1"] })
    const merged = await store.save("sess-1", { modules: { camunda7: { fresh: true } } })
    expect(merged.modules?.camunda7).toEqual({ pinned: ["d1"], fresh: true })
  })

  it("deletes a stored profile", async () => {
    const store = await makeStore()
    await store.save("sess-1", { theme: "dark" })
    expect(await store.delete("sess-1")).toBe(true)
    expect(await store.get("sess-1")).toBeUndefined()
    expect(await store.delete("sess-1")).toBe(false)
  })

  it("keeps both of two concurrent saves of disjoint top-level fields", async () => {
    const store = await makeStore()
    // The settings page has two independent save buttons — overlapping saves
    // must both land: every store merges INSIDE its per-key serialization.
    await Promise.all([
      store.save("sess-1", { theme: "dark" }),
      store.save("sess-1", { language: "de" }),
    ])
    const profile = await store.get("sess-1")
    expect(profile?.theme).toBe("dark")
    expect(profile?.language).toBe("de")
  })

  it("keeps concurrent saves from DIFFERENT modules — no module's update is lost", async () => {
    const store = await makeStore()
    // Exactly the tool paths: each module's save tool hands the store its
    // patch (`saveModuleSlice`); the model may fire camunda7_engine "select"
    // and analytics_save_settings in one turn. Repeated, because an
    // unserialized read-merge-write loses one of them only when the two
    // calls interleave.
    for (let round = 0; round < 10; round += 1) {
      const key = `user-${round}`
      await store.save(key, { modules: { camunda7: { pinnedDashboardIds: ["d1"] } } })
      await Promise.all([
        saveModuleSlice(store, key, "camunda7", { defaultEngineId: "prod-a" }),
        saveModuleSlice(store, key, "analytics", { defaultPeriod: "30d" }),
        store.save(key, { theme: "dark" }),
      ])
      const profile = await store.get(key)
      expect(profile?.modules).toEqual({
        camunda7: { pinnedDashboardIds: ["d1"], defaultEngineId: "prod-a" },
        analytics: { defaultPeriod: "30d" },
      })
      expect(profile?.theme).toBe("dark")
    }
  })

  it("keeps concurrent saves of different fields in the SAME slice: a stale value never wins", async () => {
    const store = await makeStore()
    // The model fires camunda7_engine "select" and camunda7_save_user_profile
    // in one turn, and the field the select changes ALREADY holds a value.
    // A save tool that hands the store a pre-read slice (read outside the
    // lock) writes that stale value back. The patch alone, merged inside the
    // store's per-key serialization, keeps both.
    for (let round = 0; round < 10; round += 1) {
      const key = `user-${round}`
      await store.save(key, { modules: { camunda7: { defaultEngineId: "prod-a", extra: 1 } } })
      await Promise.all([
        saveModuleSlice(store, key, "camunda7", { defaultEngineId: "prod-b" }),
        saveModuleSlice(store, key, "camunda7", { pinnedDashboardIds: ["d1"] }),
      ])
      expect((await store.get(key))?.modules?.camunda7).toEqual({
        defaultEngineId: "prod-b",
        pinnedDashboardIds: ["d1"],
        extra: 1,
      })
    }
  })

  it("saveModuleSlice clears a field patched to undefined and reports the saved slice", async () => {
    const store = await makeStore()
    await saveModuleSlice(store, "sess-1", "camunda7", { defaultEngineId: "prod-a", keep: true })
    const slice = await saveModuleSlice(store, "sess-1", "camunda7", { defaultEngineId: undefined })
    expect(slice).toEqual({ keep: true })
    expect((await store.get("sess-1"))?.modules?.camunda7).toEqual({ keep: true })
  })

  it("stamps the owner and keeps it on later saves without auth context", async () => {
    const store = await makeStore()
    const created = await store.save("user-1", { language: "de" }, { userId: "user-1" })
    expect(created.userId).toBe("user-1")
    const updated = await store.save("user-1", { theme: "dark" })
    expect(updated.userId).toBe("user-1")
  })
}

describe("createInMemoryProfileStore", () => {
  profileStoreContract(() => Promise.resolve(createInMemoryProfileStore()))
})

describe("createFileSystemProfileStore", () => {
  profileStoreContract(async () =>
    createFileSystemProfileStore({ dir: await mkdtemp(path.join(tmpdir(), "profile-store-")) }),
  )

  it("serializes saves per key across two store instances on the same directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "profile-store-"))
    const a = createFileSystemProfileStore({ dir })
    const b = createFileSystemProfileStore({ dir })
    await Promise.all([
      a.save("sess-1", { modules: { camunda7: { defaultEngineId: "prod-a" } } }),
      b.save("sess-1", { modules: { analytics: { defaultPeriod: "30d" } } }),
    ])
    expect((await a.get("sess-1"))?.modules).toEqual({
      camunda7: { defaultEngineId: "prod-a" },
      analytics: { defaultPeriod: "30d" },
    })
  })

  it("keeps serving the key after a failed save (the lock is released on error)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "profile-store-"))
    // A FILE where the store expects its directory: every write fails.
    const blocked = path.join(dir, "blocked")
    await writeFile(blocked, "", "utf-8")
    const store = createFileSystemProfileStore({ dir: blocked })
    await expect(store.save("sess-1", { theme: "dark" })).rejects.toThrow()
    await expect(store.save("sess-1", { theme: "dark" })).rejects.toThrow()
  })

  it("upgrades a persisted v1 record on read (flat fields → module slices)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "profile-store-"))
    const store = createFileSystemProfileStore({ dir })
    await writeFile(path.join(dir, "legacy.json"), JSON.stringify(V1_RECORD), "utf-8")

    const migrated = await store.get("legacy")
    expect(migrated).toMatchObject({
      language: "de",
      theme: "dark",
      schemaVersion: 3,
      modules: {
        analytics: { defaultPeriod: "30d", minBucketSize: 25 },
        camunda7: { pinnedDashboardIds: [] },
      },
    })
    expect(migrated).not.toHaveProperty("analyticsDefaultPeriod")
    expect(migrated).not.toHaveProperty("pinnedDashboardIds")
  })

  it("upgrades a persisted v2 record on read (flat camunda7 fields → modules.camunda7)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "profile-store-"))
    const store = createFileSystemProfileStore({ dir })
    await writeFile(path.join(dir, "v2.json"), JSON.stringify(V2_RECORD), "utf-8")

    const migrated = await store.get("v2")
    expect(migrated).toMatchObject({
      language: "de",
      schemaVersion: 3,
      modules: {
        analytics: { defaultPeriod: "14d" },
        camunda7: {
          defaultEngineId: "prod-a",
          allowedEngineIds: ["prod-a", "prod-b"],
          pinnedDashboardIds: ["d1"],
          preferredRole: "operations",
        },
      },
    })
    expect(migrated).not.toHaveProperty("defaultEngineId")
    expect(migrated).not.toHaveProperty("allowedEngineIds")
  })

  it("reads a record it cannot date (the next save stamps both timestamps)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "profile-store-"))
    const store = createFileSystemProfileStore({ dir })
    await writeFile(path.join(dir, "undated.json"), JSON.stringify({ schemaVersion: 3 }), "utf-8")
    expect(await store.get("undated")).toMatchObject({ id: "undated", updatedAt: "" })
    const saved = await store.save("undated", { theme: "dark" })
    expect(saved.updatedAt).not.toBe("")
    expect(saved.createdAt).toBe(saved.updatedAt)
  })

  it("treats a file that is not JSON as absent and replaces it on the next save", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "profile-store-"))
    const store = createFileSystemProfileStore({ dir })
    await writeFile(path.join(dir, "broken.json"), "{ not json", "utf-8")
    expect(await store.get("broken")).toBeUndefined()
    expect((await store.save("broken", { theme: "dark" })).theme).toBe("dark")
    expect((await store.get("broken"))?.theme).toBe("dark")
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

/** A realistic record as the v2 build persisted it (flat camunda7 fields). */
const V2_RECORD = {
  id: "v2",
  language: "de",
  theme: "dark",
  defaultEngineId: "prod-a",
  allowedEngineIds: ["prod-a", "prod-b"],
  pinnedDashboardIds: ["d1"],
  preferredRole: "operations",
  modules: { analytics: { defaultPeriod: "14d" } },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  schemaVersion: 2,
}

// Opt-in integration slice (like test:host): needs a reachable Postgres, so it
// only runs when TEST_DATABASE_URL is set — `pnpm test:pg` at the repo root
// points it at the compose stack's dedicated test database. An own schema
// isolates it from the other packages' suites sharing that database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const TEST_SCHEMA = "widget_shell_profile_store_test"

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

  it("reads a row missing every field best-effort and keeps it on save", async () => {
    const store = createPostgresProfileStore({ sql })
    await sql`
      INSERT INTO user_profiles (key, profile)
      VALUES ('sess-sparse', '{"schemaVersion": 999}'::jsonb)
    `
    expect(await store.get("sess-sparse")).toMatchObject({
      id: "sess-sparse",
      language: "en",
      theme: "system",
      modules: {},
    })

    const saved = await store.save("sess-sparse", { theme: "dark" })
    expect(saved.theme).toBe("dark")
    expect(await store.get("sess-sparse")).toEqual(saved)
  })

  it("upgrades a v1 row on read (flat fields → module slices)", async () => {
    const store = createPostgresProfileStore({ sql })
    await sql`
      INSERT INTO user_profiles (key, profile)
      VALUES ('legacy', ${sql.json(V1_RECORD)})
    `
    const migrated = await store.get("legacy")
    expect(migrated).toMatchObject({
      language: "de",
      schemaVersion: 3,
      modules: { analytics: { defaultPeriod: "30d", minBucketSize: 25 } },
    })
  })

  it("merges concurrent saves of disjoint fields in the SAME module slice", async () => {
    const store = createPostgresProfileStore({ sql })
    // The one-level slice merge runs inside the per-key lock, so neither
    // field may get lost even though both writers pre-read the same (empty)
    // slice outside it.
    await Promise.all([
      store.save("sess-2", { modules: { camunda7: { defaultEngineId: "prod-a" } } }),
      store.save("sess-2", { modules: { camunda7: { pinned: ["d1"] } } }),
    ])
    const profile = await store.get("sess-2")
    expect(profile?.modules?.camunda7).toEqual({ defaultEngineId: "prod-a", pinned: ["d1"] })
  })
})
