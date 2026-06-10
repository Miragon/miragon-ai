import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// The session id is read off the Hono request context that mcp-use propagates
// via AsyncLocalStorage — mock it so each case controls the session header.
vi.mock("mcp-use/server", () => ({
  getRequestContext: vi.fn(() => undefined),
}))
import { getRequestContext } from "mcp-use/server"
import {
  SESSION_TTL_MS,
  clearSelectedEngine,
  getSelectedEngine,
  setSelectedEngine,
} from "./engine-session.js"

const mockedContext = vi.mocked(getRequestContext)

/** Makes subsequent get/set calls run "inside" the given MCP session. */
function actAsSession(sessionId: string | undefined): void {
  if (!sessionId) {
    mockedContext.mockReturnValue(undefined as never)
    return
  }
  mockedContext.mockReturnValue({
    req: {
      header: (name: string) => (name.toLowerCase() === "mcp-session-id" ? sessionId : undefined),
    },
  } as never)
}

describe("engine-session TTL eviction", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-10T08:00:00Z"))
  })

  afterEach(() => {
    // The selection map is module-global — leave it empty for other suites.
    for (const sid of ["a", "b", "stale"]) clearSelectedEngine(sid)
    vi.useRealTimers()
  })

  it("returns the selection while the TTL has not elapsed", () => {
    actAsSession("a")
    setSelectedEngine("prod-a")
    vi.advanceTimersByTime(SESSION_TTL_MS)
    expect(getSelectedEngine()).toBe("prod-a")
  })

  it("expires a stale selection lazily on read", () => {
    actAsSession("a")
    setSelectedEngine("prod-a")
    vi.advanceTimersByTime(SESSION_TTL_MS + 1)
    expect(getSelectedEngine()).toBeUndefined()
  })

  it("sweeps expired selections of other sessions on set", () => {
    actAsSession("stale")
    setSelectedEngine("prod-a")

    vi.advanceTimersByTime(SESSION_TTL_MS + 1)
    actAsSession("b")
    setSelectedEngine("prod-b")

    // Rewind inside the stale entry's original TTL window: if the sweep had
    // not deleted it, this read would still return "prod-a" — lazy expiry
    // alone cannot explain an undefined here.
    vi.setSystemTime(new Date("2026-06-10T08:00:01Z"))
    actAsSession("stale")
    expect(getSelectedEngine()).toBeUndefined()
  })

  it("re-setting a selection refreshes its TTL", () => {
    actAsSession("a")
    setSelectedEngine("prod-a")
    vi.advanceTimersByTime(SESSION_TTL_MS - 1)
    setSelectedEngine("prod-b")
    vi.advanceTimersByTime(SESSION_TTL_MS - 1)
    expect(getSelectedEngine()).toBe("prod-b")
  })

  it("isolates selections per session and supports explicit clearing", () => {
    actAsSession("a")
    setSelectedEngine("prod-a")
    actAsSession("b")
    expect(getSelectedEngine()).toBeUndefined()
    setSelectedEngine("prod-b")
    expect(getSelectedEngine()).toBe("prod-b")

    clearSelectedEngine("a")
    actAsSession("a")
    expect(getSelectedEngine()).toBeUndefined()
  })

  it("throws on set and returns undefined on get without a session in scope", () => {
    actAsSession(undefined)
    expect(() => setSelectedEngine("prod-a")).toThrow(
      "No active MCP session — cannot store an engine selection",
    )
    expect(getSelectedEngine()).toBeUndefined()
  })
})
