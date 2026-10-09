import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import {
  announcePersistence,
  persistenceFromEnv,
  profileStoreFromEnv,
} from "./profile-store-env.js"

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
    await store.save("user-1", { language: "de" })
    // A SECOND store over the same dir sees the record — proof it hit disk.
    expect((await profileStoreFromEnv({ MCP_PROFILE_DIR: dir }).get("user-1"))?.language).toBe("de")
  })

  it("falls back to the in-memory store without the env knob", async () => {
    const store = profileStoreFromEnv({})
    await store.save("user-1", { language: "de" })
    // A second instance shares nothing — proof it stayed in-process.
    expect(await profileStoreFromEnv({}).get("user-1")).toBeUndefined()
  })
})
