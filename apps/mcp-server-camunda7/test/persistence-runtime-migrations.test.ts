import { afterEach, describe, expect, it, vi } from "vitest"
import { createSql, runMigrations } from "@miragon-ai/widget-shell/server"
import { initRuntime } from "../src/persistence/index.js"

// Only the two Postgres entry points are replaced; everything else
// `initRuntime` uses (the stores, the announcement) stays real.
vi.mock("@miragon-ai/widget-shell/server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createSql: vi.fn(),
  runMigrations: vi.fn(),
}))

type Sql = Awaited<ReturnType<typeof createSql>>

/** A recording stand-in for the postgres.js client: the boot path only ever ends it. */
function recordingSql(end: () => Promise<void> = () => Promise.resolve()) {
  const ended = vi.fn(end)
  return { sql: { end: ended } as unknown as Sql, ended }
}

const DATABASE_ENV = { DATABASE_URL: "postgres://miragon:miragon@db.example:5432/miragon" }

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(createSql).mockReset()
  vi.mocked(runMigrations).mockReset()
})

/**
 * A boot whose migrations fail must release the client it opened: the
 * pool's sockets would otherwise keep the failing process alive (and its
 * connections open against the database) instead of letting it exit.
 */
describe("initRuntime (database path, failing migrations)", () => {
  it("closes the client and fails the boot with the migration error", async () => {
    const { sql, ended } = recordingSql()
    vi.mocked(createSql).mockResolvedValue(sql)
    const failure = new Error("could not obtain lock on relation schema_migrations")
    vi.mocked(runMigrations).mockRejectedValue(failure)

    await expect(initRuntime(DATABASE_ENV)).rejects.toBe(failure)
    expect(createSql).toHaveBeenCalledWith(DATABASE_ENV.DATABASE_URL)
    expect(ended).toHaveBeenCalledTimes(1)
    expect(ended).toHaveBeenCalledWith({ timeout: 5 })
  })

  it("still reports the migration error when closing the client fails too", async () => {
    const { sql, ended } = recordingSql(() => Promise.reject(new Error("socket already closed")))
    vi.mocked(createSql).mockResolvedValue(sql)
    const failure = new Error("relation user_profiles: permission denied")
    vi.mocked(runMigrations).mockRejectedValue(failure)

    await expect(initRuntime(DATABASE_ENV)).rejects.toBe(failure)
    expect(ended).toHaveBeenCalledTimes(1)
  })

  it("keeps the client open after successful migrations — the stores and the shutdown own it", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    const { sql, ended } = recordingSql()
    vi.mocked(createSql).mockResolvedValue(sql)
    vi.mocked(runMigrations).mockResolvedValue(["001_user_profiles"])

    const runtime = await initRuntime(DATABASE_ENV)
    expect(ended).not.toHaveBeenCalled()
    expect(Object.keys(runtime.readiness)).toEqual(["database"])
    await runtime.shutdown()
    expect(ended).toHaveBeenCalledWith({ timeout: 5 })
  })
})
