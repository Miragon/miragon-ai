import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import { createDefaultProfileStore, initRuntime } from "../src/persistence/index.js"

const env = (overrides: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  MCP_PROFILE_SESSION_TTL_DAYS: "0",
  ...overrides,
})

describe("initRuntime (non-database path)", () => {
  it("selects in-memory stores and a resolvable shutdown when nothing is configured", async () => {
    const runtime = await initRuntime(env())
    expect(runtime.dashboardStore).toBeUndefined()
    await expect(runtime.profileStore.get("nobody")).resolves.toBeUndefined()
    await runtime.shutdown()
  })

  it("selects the filesystem stores when the dir knobs are set", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mcp-profile-"))
    const runtime = await initRuntime(
      env({ MCP_PROFILE_DIR: path.join(dir, "p"), MCP_DASHBOARD_DIR: path.join(dir, "d") }),
    )
    expect(runtime.dashboardStore).toBeDefined()
    await runtime.shutdown()
  })

  it("runs the session cleanup at boot when a TTL is configured", async () => {
    const runtime = await initRuntime(env({ MCP_PROFILE_SESSION_TTL_DAYS: "1" }))
    // In-memory store, nothing to expire — the sweep must still settle quietly.
    await runtime.shutdown()
  })

  it("warns that REDIS_URL is ignored since mcp-use 2 removed the session-backend seam", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const runtime = await initRuntime(env({ REDIS_URL: "redis://localhost:6379" }))
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("REDIS_URL"))
      await runtime.shutdown()
    } finally {
      warn.mockRestore()
    }
  })
})

describe("createDefaultProfileStore", () => {
  it("falls back to the in-memory store without MCP_PROFILE_DIR", async () => {
    const store = createDefaultProfileStore(env())
    await expect(store.get("missing")).resolves.toBeUndefined()
  })
})
