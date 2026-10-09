import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import postgres from "postgres"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  createFileSystemProfileStore,
  mergeProfile,
  mergeStoredProfile,
  type ProfileStore,
} from "./profile-store.js"
import { createPostgresProfileStore, PROFILE_STORE_MIGRATIONS } from "./profile-store-postgres.js"
import { mergeRawSlice } from "./profile-slice.js"

/**
 * Saves merge over the RAW stored document, never over its parsed view — the
 * guard against one unknown value (or one newer build's record) wiping every
 * module's settings on the next save. The store-agnostic behavior contract
 * lives in `profile-store.test.ts`.
 */

describe("mergeStoredProfile", () => {
  const NOW = "2026-10-09T12:00:00.000Z"

  it("returns the document to persist (raw keys kept) and its typed view", () => {
    const { document, record } = mergeStoredProfile(
      "k",
      { id: "k", language: "fr", extra: 1, schemaVersion: 3, createdAt: "c", updatedAt: "u" },
      { theme: "dark" },
      NOW,
    )
    expect(document).toEqual({
      id: "k",
      language: "fr",
      theme: "dark",
      extra: 1,
      modules: {},
      userId: undefined,
      createdAt: "c",
      updatedAt: NOW,
      schemaVersion: 3,
    })
    expect(record).toEqual({
      id: "k",
      language: "en",
      theme: "dark",
      modules: {},
      createdAt: "c",
      updatedAt: NOW,
      schemaVersion: 3,
    })
  })

  it("stamps createdAt on a document that carries none, and upgrades an older one", () => {
    const { document } = mergeStoredProfile(
      "k",
      { analyticsDefaultPeriod: "30d", schemaVersion: 1 },
      {},
      NOW,
    )
    expect(document).toMatchObject({
      createdAt: NOW,
      schemaVersion: 3,
      modules: { analytics: { defaultPeriod: "30d" } },
    })
    expect(document).not.toHaveProperty("analyticsDefaultPeriod")
  })

  it("starts a never-saved key from the defaults", () => {
    const { record } = mergeStoredProfile("k", undefined, { language: "de" }, NOW, {
      userId: "u-1",
    })
    expect(record).toMatchObject({ id: "k", language: "de", theme: "system", userId: "u-1" })
  })

  it("keeps the 0.18 mergeProfile signature (typed half only)", () => {
    const previous = mergeProfile("k", undefined, { language: "de" }, NOW)
    expect(mergeProfile("k", previous, { theme: "dark" }, NOW)).toMatchObject({
      language: "de",
      theme: "dark",
      createdAt: previous.createdAt,
    })
  })
})

/**
 * What a DURABLE store must do with a stored document it cannot fully
 * validate — a value this build doesn't know (a locale added later), keys it
 * has never heard of, or a whole document from a NEWER build during a rolling
 * deploy or after a rollback. Reads degrade per FIELD; saves merge over the
 * RAW document, so nothing this build doesn't understand is ever dropped.
 * `seedRaw`/`readRaw` reach underneath the store to the persisted JSON.
 */
interface RawHarness {
  store: ProfileStore
  seedRaw: (key: string, doc: Record<string, unknown>) => Promise<void>
  readRaw: (key: string) => Promise<Record<string, unknown> | undefined>
}

function rawDocumentContract(makeHarness: () => Promise<RawHarness>) {
  const STORED = {
    id: "user-1",
    userId: "user-1",
    language: "fr", // a locale this build does not ship
    theme: "dark",
    futureTopLevel: { nested: true },
    modules: {
      camunda7: { defaultEngineId: "prod-a", futureSliceField: 7 },
      analytics: { defaultPeriod: "30d" },
      notes: { sortOrder: "asc" },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    schemaVersion: 3,
  }

  it("reads a document with one unknown value field by field — only that field degrades", async () => {
    const { store, seedRaw } = await makeHarness()
    await seedRaw("user-1", STORED)
    expect(await store.get("user-1")).toEqual({
      id: "user-1",
      userId: "user-1",
      language: "en",
      theme: "dark",
      modules: STORED.modules,
      createdAt: STORED.createdAt,
      updatedAt: STORED.updatedAt,
      schemaVersion: 3,
    })
  })

  it("round-trips unknown top-level keys and values through a save from ANY module", async () => {
    const { store, seedRaw, readRaw } = await makeHarness()
    await seedRaw("user-1", STORED)

    // The analytics settings save path, end to end.
    const slice = await mergeRawSlice(store, "user-1", "analytics", { minBucketSize: 25 })
    const saved = await store.save(
      "user-1",
      { modules: { analytics: slice } },
      { userId: "user-1" },
    )

    const modules = { ...STORED.modules, analytics: { defaultPeriod: "30d", minBucketSize: 25 } }
    expect(saved.modules).toEqual(modules)
    expect(saved.createdAt).toBe(STORED.createdAt)
    expect(await readRaw("user-1")).toEqual({ ...STORED, modules, updatedAt: saved.updatedAt })
  })

  it("never mangles a document from a NEWER build (rolling-deploy skew)", async () => {
    const { store, seedRaw, readRaw } = await makeHarness()
    const newer = {
      ...STORED,
      language: "de",
      schemaVersion: 99,
      newCoreField: ["written", "by", "v99"],
    }
    await seedRaw("user-1", newer)

    // Read best-effort: every field this build still understands survives.
    expect(await store.get("user-1")).toMatchObject({
      language: "de",
      theme: "dark",
      modules: STORED.modules,
    })

    const saved = await store.save("user-1", { theme: "light" })
    expect(saved).toMatchObject({ language: "de", theme: "light", modules: STORED.modules })
    // Never stamped down to this build's version: the newer build reads its
    // own document back without re-running migrations over it.
    expect(await readRaw("user-1")).toEqual({
      ...newer,
      theme: "light",
      updatedAt: saved.updatedAt,
    })
  })
}

describe("createFileSystemProfileStore (raw documents)", () => {
  rawDocumentContract(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "profile-store-raw-"))
    const file = (key: string) => path.join(dir, `${encodeURIComponent(key)}.json`)
    return {
      store: createFileSystemProfileStore({ dir }),
      seedRaw: (key, doc) => writeFile(file(key), JSON.stringify(doc), "utf-8"),
      readRaw: async (key) =>
        JSON.parse(await readFile(file(key), "utf-8")) as Record<string, unknown>,
    }
  })
})

// Opt-in integration slice: only with TEST_DATABASE_URL (`pnpm test:pg`). An
// own schema isolates it from the other suites sharing that database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const TEST_SCHEMA = "widget_shell_profile_store_raw_test"

describe.skipIf(!TEST_DATABASE_URL)("createPostgresProfileStore (raw documents)", () => {
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

  rawDocumentContract(() =>
    Promise.resolve({
      store: createPostgresProfileStore({ sql }),
      seedRaw: async (key, doc) => {
        await sql`
          INSERT INTO user_profiles (key, profile)
          VALUES (${key}, ${sql.json(doc as postgres.JSONValue)})
        `
      },
      readRaw: async (key) => {
        const rows = await sql<{ profile: Record<string, unknown> }[]>`
          SELECT profile FROM user_profiles WHERE key = ${key}
        `
        return rows[0]?.profile
      },
    }),
  )
})
