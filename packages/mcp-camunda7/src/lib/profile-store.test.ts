import { mkdtemp } from "node:fs/promises"
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
import { defaultUserProfile, userProfilePreferencesSchema } from "./profile-schema.js"

describe("defaultUserProfile", () => {
  it("returns a complete, defaulted profile for an unsaved key", () => {
    const p = defaultUserProfile("sess-1")
    expect(p).toMatchObject({
      id: "sess-1",
      language: "en",
      theme: "system",
      pinnedDashboardIds: [],
      analyticsDefaultPeriod: "7d",
      analyticsMinBucketSize: 10,
      schemaVersion: 1,
    })
    expect(p.defaultEngineId).toBeUndefined()
    expect(p.allowedEngineIds).toBeUndefined()
  })

  it("the preferences schema fills every default from an empty object", () => {
    expect(userProfilePreferencesSchema.parse({})).toEqual({
      language: "en",
      theme: "system",
      pinnedDashboardIds: [],
      analyticsDefaultPeriod: "7d",
      analyticsMinBucketSize: 10,
    })
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

  it("deletes a stored profile", async () => {
    const store = await makeStore()
    await store.save("sess-1", { theme: "dark" })
    expect(await store.delete("sess-1")).toBe(true)
    expect(await store.get("sess-1")).toBeUndefined()
    expect(await store.delete("sess-1")).toBe(false)
  })
}

describe("createInMemoryProfileStore", () => {
  profileStoreContract(() => Promise.resolve(createInMemoryProfileStore()))
})

describe("createFileSystemProfileStore", () => {
  profileStoreContract(async () =>
    createFileSystemProfileStore({ dir: await mkdtemp(path.join(tmpdir(), "profile-store-")) }),
  )
})

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
