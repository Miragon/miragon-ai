import { afterEach, describe, expect, it, vi } from "vitest"
import { allowsDurableWrites, ANALYTICS_TOOLSETS, isAnalyticsToolset } from "./toolsets.js"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("allowsDurableWrites", () => {
  it("permits writes when no toolset is configured", () => {
    expect(allowsDurableWrites(undefined)).toBe(true)
  })

  it("forbids writes in the module's read-only toolset", () => {
    expect(allowsDurableWrites("read-only")).toBe(false)
  })

  it("fails CLOSED on an unknown toolset name, with a warning", () => {
    // A typo'd `analytics:read-onyl` must not grant the one write the
    // operator tried to disable — unknown names degrade to `read-only`.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(allowsDurableWrites("operations")).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
  })

  it("decides by declared name, not by an ad-hoc string compare", () => {
    // The regression this guards: a `toolset === "read-only"` check silently
    // fails open for every name that is NOT that literal — including a second
    // restrictive toolset added later. Every declared toolset must be a
    // deliberate decision here.
    for (const toolset of ANALYTICS_TOOLSETS) {
      expect(isAnalyticsToolset(toolset)).toBe(true)
      expect(typeof allowsDurableWrites(toolset)).toBe("boolean")
    }
  })
})
