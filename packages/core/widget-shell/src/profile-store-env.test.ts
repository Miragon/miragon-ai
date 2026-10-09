import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import {
  announcePersistence,
  persistenceFromEnv,
  profileStoreFromEnv,
  startProfileSessionCleanup,
} from "./profile-store-env.js"
import { createInMemoryProfileStore } from "./profile-store.js"

describe("persistenceFromEnv", () => {
  it("reports the non-database selection per store", () => {
    expect(persistenceFromEnv({})).toEqual({ profiles: "memory", dashboards: "memory" })
    expect(persistenceFromEnv({ MCP_PROFILE_DIR: "/p", MCP_DASHBOARD_DIR: "/d" })).toEqual({
      profiles: "filesystem",
      dashboards: "filesystem",
    })
  })
})

describe("announcePersistence", () => {
  const capture = () => ({
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
  })

  it("logs the selected backends on every path", () => {
    const { log, warn } = capture()
    announcePersistence(
      { profiles: "postgres", dashboards: "postgres" },
      { env: { NODE_ENV: "production" }, label: "root" },
    )
    expect(log).toHaveBeenCalledWith("[root] persistence: profiles=postgres, dashboards=postgres")
    expect(warn).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it("warns LOUDLY when a production process keeps a store in memory — naming each", () => {
    const { warn } = capture()
    announcePersistence(
      { profiles: "memory", dashboards: "memory" },
      { env: { NODE_ENV: "production" }, label: "root", remedy: "Set DATABASE_URL." },
    )
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toBe(
      "[root] WARNING: user profiles and saved dashboards are kept IN MEMORY in a production process — every restart, redeploy or scale-to-zero stop silently drops them. Set DATABASE_URL.",
    )

    announcePersistence(
      { profiles: "filesystem", dashboards: "memory" },
      { env: { NODE_ENV: "production" } },
    )
    expect(warn.mock.calls[1][0]).toMatch(/^\[persistence\] WARNING: saved dashboards are kept/)
    expect(warn.mock.calls[1][0]).toContain("MCP_PROFILE_DIR / MCP_DASHBOARD_DIR")
    vi.restoreAllMocks()
  })

  it("leaves dashboards out entirely when the server keeps none", () => {
    const { log, warn } = capture()
    announcePersistence({ profiles: "memory" }, { env: { NODE_ENV: "production" } })
    expect(log).toHaveBeenCalledWith("[persistence] persistence: profiles=memory")
    expect(warn.mock.calls[0][0]).toMatch(/WARNING: user profiles are kept IN MEMORY/)
    announcePersistence({ profiles: "filesystem" }, { env: { NODE_ENV: "production" } })
    expect(warn).toHaveBeenCalledOnce()
    vi.restoreAllMocks()
  })

  it("stays quiet outside production (dev, tests)", () => {
    const { warn } = capture()
    announcePersistence({ profiles: "memory", dashboards: "memory" }, { env: {} })
    announcePersistence(
      { profiles: "memory", dashboards: "memory" },
      { env: { NODE_ENV: "development" } },
    )
    expect(warn).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})

describe("profileStoreFromEnv", () => {
  it("selects the filesystem store when MCP_PROFILE_DIR is set (records persist)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "profile-env-"))
    const store = profileStoreFromEnv({ MCP_PROFILE_DIR: dir })
    await store.save("sess-1", { language: "de" })
    // A SECOND store over the same dir sees the record — proof it hit disk.
    expect((await profileStoreFromEnv({ MCP_PROFILE_DIR: dir }).get("sess-1"))?.language).toBe("de")
  })

  it("falls back to the in-memory store without the env knob", async () => {
    const store = profileStoreFromEnv({})
    await store.save("sess-1", { language: "de" })
    // A second instance shares nothing — proof it stayed in-process.
    expect(await profileStoreFromEnv({}).get("sess-1")).toBeUndefined()
  })
})

describe("startProfileSessionCleanup", () => {
  it("expires old session records on the immediate boot run", async () => {
    const store = createInMemoryProfileStore()
    // Save on a clock beyond the 30d default window (only Date is faked).
    vi.useFakeTimers({ now: Date.now() - 40 * 24 * 60 * 60 * 1000, toFake: ["Date"] })
    try {
      await store.save("sess-old", { theme: "dark" })
    } finally {
      vi.useRealTimers()
    }

    const stop = startProfileSessionCleanup(store, { env: {} })
    await vi.waitFor(async () => {
      expect(await store.get("sess-old")).toBeUndefined()
    })
    stop()
  })

  it("is a no-op for TTL 0 or garbage TTL values", async () => {
    const store = createInMemoryProfileStore()
    const spy = vi.spyOn(store, "cleanupSessions")
    startProfileSessionCleanup(store, { env: { MCP_PROFILE_SESSION_TTL_DAYS: "0" } })()
    startProfileSessionCleanup(store, { env: { MCP_PROFILE_SESSION_TTL_DAYS: "nope" } })()
    expect(spy).not.toHaveBeenCalled()
  })

  it("survives a store outage (logs, never throws)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const broken = {
      ...createInMemoryProfileStore(),
      cleanupSessions: () => Promise.reject(new Error("pg down")),
    }
    const stop = startProfileSessionCleanup(broken, { env: {}, label: "test-root" })
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("[test-root] session-profile cleanup failed:"),
        expect.any(Error),
      )
    })
    stop()
    vi.restoreAllMocks()
  })
})
