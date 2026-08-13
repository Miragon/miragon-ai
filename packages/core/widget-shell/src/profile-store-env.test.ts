import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import { profileStoreFromEnv, startProfileSessionCleanup } from "./profile-store-env.js"
import { createInMemoryProfileStore } from "./profile-store.js"

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
    await store.save("sess-old", { theme: "dark" })
    // Backdate the record beyond the 30d default window.
    const record = await store.get("sess-old")
    ;(record as { updatedAt: string }).updatedAt = new Date(
      Date.now() - 40 * 24 * 60 * 60 * 1000,
    ).toISOString()

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
