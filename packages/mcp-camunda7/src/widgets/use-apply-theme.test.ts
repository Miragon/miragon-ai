// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook } from "@testing-library/react"
import { useApplyTheme } from "./use-apply-theme.js"

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove("dark")
  vi.unstubAllGlobals()
})

/** Stub `matchMedia` with a fixed OS preference. */
function stubOsPreference(dark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: dark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  )
}

describe("useApplyTheme", () => {
  it("applies dark for an explicit dark profile", () => {
    renderHook(() => useApplyTheme("dark"))
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("applies light for an explicit light profile", () => {
    stubOsPreference(true)
    renderHook(() => useApplyTheme("light"))
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("follows the OS preference for a system profile", () => {
    stubOsPreference(true)
    renderHook(() => useApplyTheme("system"))
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("follows the OS preference while the profile is still undefined (no forced light)", () => {
    // Regression: `undefined` used to be treated like "light", overriding the
    // OS preference during profile load and in analytics-only deployments.
    stubOsPreference(true)
    renderHook(() => useApplyTheme(undefined))
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })
})
