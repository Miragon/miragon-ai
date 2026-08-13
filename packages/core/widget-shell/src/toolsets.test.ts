import { afterEach, describe, expect, it, vi } from "vitest"
import { createToolsetVocabulary } from "./toolsets.js"

const vocab = () =>
  createToolsetVocabulary("mymodule", ["read-only", "operations"] as const, "read-only")

afterEach(() => {
  vi.restoreAllMocks()
})

describe("createToolsetVocabulary", () => {
  it("recognizes declared names", () => {
    const v = vocab()
    expect(v.isKnown("read-only")).toBe(true)
    expect(v.isKnown("admin")).toBe(false)
    expect(v.resolve("operations")).toBe("operations")
  })

  it("resolves undefined silently (no toolset configured = expose everything)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(vocab().resolve(undefined)).toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })

  it("fails CLOSED on unknown names — degrades to the fallback toolset, loudly", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(vocab().resolve("does-not-exist")).toBe("read-only")
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown toolset "does-not-exist"'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[mymodule]"))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('falling back to "read-only"'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("read-only, operations"))
  })
})
