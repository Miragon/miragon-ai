// @vitest-environment happy-dom
import { createElement, type ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { ShellHostProvider, type ShellHost } from "./shell-host.js"
import { useApplyTheme } from "./use-apply-theme.js"

const root = document.documentElement

afterEach(() => {
  cleanup()
  root.className = ""
  root.removeAttribute("data-theme")
  root.removeAttribute("style")
  vi.unstubAllGlobals()
})

/** Stub `matchMedia` with a fixed OS preference; returns the change-listener registry. */
function stubOsPreference(dark: boolean) {
  const query = { matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  const matchMedia = vi.fn().mockReturnValue(query)
  vi.stubGlobal("matchMedia", matchMedia)
  return { query, matchMedia }
}

function inHost(host: Partial<ShellHost>) {
  const value: ShellHost = {
    connected: true,
    displayMode: "inline",
    availableDisplayModes: [],
    ...host,
  }
  return ({ children }: { children: ReactNode }) =>
    createElement(ShellHostProvider, { host: value, children })
}

/** The three document signals that must always agree. */
const documentTheme = () => ({
  dark: root.classList.contains("dark"),
  dataTheme: root.getAttribute("data-theme"),
  colorScheme: root.style.getPropertyValue("color-scheme"),
})

describe("useApplyTheme", () => {
  it("applies an explicit dark profile to .dark, data-theme and color-scheme alike", () => {
    stubOsPreference(false)
    const { result } = renderHook(() => useApplyTheme("dark"))
    expect(result.current).toBe("dark")
    expect(documentTheme()).toEqual({ dark: true, dataTheme: "dark", colorScheme: "dark" })
  })

  it("applies an explicit light profile over a dark OS", () => {
    stubOsPreference(true)
    renderHook(() => useApplyTheme("light"))
    expect(documentTheme()).toEqual({ dark: false, dataTheme: "light", colorScheme: "light" })
  })

  it("follows the OS preference for a system profile outside a host", () => {
    stubOsPreference(true)
    renderHook(() => useApplyTheme("system"))
    expect(documentTheme()).toEqual({ dark: true, dataTheme: "dark", colorScheme: "dark" })
  })

  it("follows the OS preference while the profile is still undefined (no forced light)", () => {
    // Regression: `undefined` used to be treated like "light", overriding the
    // OS preference during profile load and in analytics-only deployments.
    stubOsPreference(true)
    renderHook(() => useApplyTheme(undefined))
    expect(root.classList.contains("dark")).toBe(true)
  })

  it("follows the HOST theme over the OS for a system or missing profile (#339: dark host, light OS)", () => {
    stubOsPreference(false)
    renderHook(() => useApplyTheme("system"), { wrapper: inHost({ theme: "dark" }) })
    expect(documentTheme()).toEqual({ dark: true, dataTheme: "dark", colorScheme: "dark" })

    cleanup()
    stubOsPreference(true)
    renderHook(() => useApplyTheme(undefined), { wrapper: inHost({ theme: "light" }) })
    expect(documentTheme()).toEqual({ dark: false, dataTheme: "light", colorScheme: "light" })
  })

  it("keeps the host's transparent canvas while following it, paints its own when an explicit theme differs", () => {
    stubOsPreference(false)
    renderHook(() => useApplyTheme("system"), { wrapper: inHost({ theme: "dark" }) })
    expect(root.style.getPropertyValue("background-color")).toBe("")

    cleanup()
    renderHook(() => useApplyTheme("light"), { wrapper: inHost({ theme: "dark" }) })
    // Dark text tokens on the host's dark canvas would be unreadable.
    expect(root.style.getPropertyValue("background-color")).toBe("var(--background)")
  })

  it("maps the host palette onto the neutral tokens only while following the host theme", () => {
    stubOsPreference(false)
    const styleVariables = {
      "--color-background-primary": "#1f1e1d",
      "--color-text-primary": "#f5f4ef",
    }
    renderHook(() => useApplyTheme("system"), {
      wrapper: inHost({ theme: "dark", styleVariables }),
    })
    expect(root.style.getPropertyValue("--card")).toBe("#1f1e1d")
    expect(root.style.getPropertyValue("--foreground")).toBe("#f5f4ef")

    cleanup()
    renderHook(() => useApplyTheme("light"), {
      wrapper: inHost({ theme: "dark", styleVariables }),
    })
    // An explicit light profile in a dark host: the host's dark palette is cleared.
    expect(root.style.getPropertyValue("--card")).toBe("")
    expect(root.style.getPropertyValue("--foreground")).toBe("")
  })

  it("subscribes to the OS dark-mode query while mounted and re-resolves on its change", () => {
    const { query, matchMedia } = stubOsPreference(false)
    const { unmount } = renderHook(() => useApplyTheme("system"))
    expect(matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)")
    expect(query.addEventListener).toHaveBeenCalledWith("change", expect.any(Function))
    expect(root.classList.contains("dark")).toBe(false)

    query.matches = true
    const onChange = query.addEventListener.mock.calls[0][1] as () => void
    act(() => onChange())
    expect(root.classList.contains("dark")).toBe(true)

    unmount()
    expect(query.removeEventListener).toHaveBeenCalledWith("change", onChange)
  })

  it("resolves light without a matchMedia (no OS signal is no dark signal)", () => {
    vi.stubGlobal("matchMedia", undefined)
    const { result } = renderHook(() => useApplyTheme("system"))
    expect(result.current).toBe("light")
    expect(root.classList.contains("dark")).toBe(false)
  })
})
