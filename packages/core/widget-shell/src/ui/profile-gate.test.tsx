// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { queryClient, useLocale } from "@miragon/mcp-toolkit-ui"
import { HostBridgeProvider, type HostBridge } from "@miragon/mcp-toolkit-ui/app"
import { ProfileGate } from "./profile-gate.js"

const FEED = "camunda7_user_profile_data"

/** What the profile feed returns: the `*_data` envelope (structuredContent first). */
function feedResult(profile: { language?: string; theme?: string }) {
  return {
    content: [{ type: "text", text: JSON.stringify({ profile }) }],
    structuredContent: { profile },
  }
}

function bridgeWith(callTool: HostBridge["callTool"]): HostBridge {
  return {
    callTool,
    sendFollowup: vi.fn(),
    openExternal: vi.fn(),
    getWidgetData: () => null,
  }
}

function LocaleProbe() {
  return <p data-testid="locale">{useLocale()}</p>
}

function renderGate(callTool: HostBridge["callTool"], queryKey?: readonly string[]) {
  return render(
    <HostBridgeProvider bridge={bridgeWith(callTool)}>
      <ProfileGate profileTool={FEED} queryKey={queryKey}>
        <LocaleProbe />
      </ProfileGate>
    </HostBridgeProvider>,
  )
}

/** Stub `matchMedia` with a fixed OS preference (the "system" theme source). */
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

const isDark = () => document.documentElement.classList.contains("dark")

afterEach(async () => {
  cleanup()
  // The toolkit's query client is a module singleton shared by every mount.
  await queryClient.cancelQueries()
  queryClient.clear()
  document.documentElement.classList.remove("dark")
  document.documentElement.lang = ""
  vi.unstubAllGlobals()
})

describe("ProfileGate", () => {
  it("fetches the profile feed through the host bridge, with no arguments", async () => {
    const callTool = vi.fn().mockResolvedValue(feedResult({ language: "en" }))
    renderGate(callTool)

    await waitFor(() => expect(callTool).toHaveBeenCalledWith(FEED, {}))
    expect(callTool).toHaveBeenCalledTimes(1)
  })

  it("provides the profile locale to the tree and mirrors it on the document", async () => {
    renderGate(vi.fn().mockResolvedValue(feedResult({ language: "de" })))

    await waitFor(() => expect(screen.getByTestId("locale").textContent).toBe("de"))
    expect(document.documentElement.lang).toBe("de")
  })

  it("renders its children right away, in English, while the profile is still loading", () => {
    // Current contract (N125 in #339 may change it to a short hold): the gate
    // never blocks the first paint on the host round-trip.
    renderGate(() => new Promise(() => {}))

    expect(screen.getByTestId("locale").textContent).toBe("en")
    expect(document.documentElement.lang).toBe("en")
  })

  it("applies an explicit profile theme document-wide, over the OS preference", async () => {
    stubOsPreference(false)
    renderGate(vi.fn().mockResolvedValue(feedResult({ theme: "dark" })))
    await waitFor(() => expect(isDark()).toBe(true))

    cleanup()
    queryClient.clear()
    stubOsPreference(true)
    renderGate(vi.fn().mockResolvedValue(feedResult({ theme: "light" })))
    await waitFor(() => expect(isDark()).toBe(false))
  })

  it("falls back to English and the OS theme when the feed fails (e.g. the module is disabled)", async () => {
    stubOsPreference(true)
    const callTool = vi.fn().mockRejectedValue(new Error("unknown tool"))
    renderGate(callTool)

    await waitFor(() => expect(callTool).toHaveBeenCalled())
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId("locale").textContent).toBe("en")
    expect(document.documentElement.lang).toBe("en")
    expect(isDark()).toBe(true)
  })

  it("keys the query under the feed's module, so a module-wide invalidation flips the locale live", async () => {
    const callTool = vi
      .fn()
      .mockResolvedValueOnce(feedResult({ language: "en" }))
      .mockResolvedValue(feedResult({ language: "de" }))
    renderGate(callTool)
    await waitFor(() => expect(callTool).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId("locale").textContent).toBe("en")

    // What camunda7's refreshCockpitData does after a profile save.
    await act(async () => {
      await queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith("camunda7:"),
      })
    })

    await waitFor(() => expect(screen.getByTestId("locale").textContent).toBe("de"))
    expect(document.documentElement.lang).toBe("de")
  })

  it("uses an explicit query key instead of the module default", async () => {
    renderGate(vi.fn().mockResolvedValue(feedResult({ language: "de" })), ["custom:gate"])

    await waitFor(() => expect(screen.getByTestId("locale").textContent).toBe("de"))
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey[0])
    expect(keys).toEqual(["custom:gate"])
  })
})
