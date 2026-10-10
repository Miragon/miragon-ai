// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { queryClient, useLocale } from "@miragon/mcp-toolkit-ui"
import { HostBridgeProvider, type HostBridge } from "@miragon/mcp-toolkit-ui/app"
import { ProfileGate } from "./profile-gate.js"
import { formatTimestamp, setFormatLocale } from "./format.js"
import { ShellHostProvider, type ShellHost } from "./shell-host.js"

const FEED = "camunda7_user_profile_data"
const ISO = "2026-07-22T22:15:30.000Z"

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

/** The locale the tree reads AND the date the shared formatter renders, in one line. */
function LocaleProbe() {
  return <p data-testid="locale">{`${useLocale()}|${formatTimestamp(ISO)}`}</p>
}

const NO_HOST: ShellHost = { connected: true, displayMode: "inline", availableDisplayModes: [] }

function renderGate(
  callTool: HostBridge["callTool"],
  options: { host?: Partial<ShellHost>; queryKey?: readonly string[]; waitMs?: number } = {},
) {
  return render(
    <ShellHostProvider host={{ ...NO_HOST, ...options.host }}>
      <HostBridgeProvider bridge={bridgeWith(callTool)}>
        <ProfileGate profileTool={FEED} queryKey={options.queryKey} profileWaitMs={options.waitMs}>
          <LocaleProbe />
        </ProfileGate>
      </HostBridgeProvider>
    </ShellHostProvider>,
  )
}

/** `en|<date in en>` — what the probe shows for a locale (and optional zone). */
function probeFor(locale: string, timeZone?: string): string {
  return `${locale.split("-")[0]}|${new Date(ISO).toLocaleString(locale, timeZone ? { timeZone } : {})}`
}

const probe = () => screen.getByTestId("locale").textContent

/** Stub `matchMedia` with a fixed OS preference (the theme's last fallback). */
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

const CLIENT_DEFAULTS = queryClient.getDefaultOptions()

/**
 * Make a failed fetch terminal at once. The toolkit's client keeps
 * react-query's default retries (3, backing off ~7 s), and while they run the
 * query is still PENDING — the gate then waits for its bound instead.
 */
function failFast() {
  queryClient.setDefaultOptions({
    ...CLIENT_DEFAULTS,
    queries: { ...CLIENT_DEFAULTS.queries, retry: false },
  })
}

/** The gate's query, under the feed's module default key (args `{}` appended). */
const gateQueryStatus = () => queryClient.getQueryState(["camunda7:profile-gate", {}])?.status

afterEach(async () => {
  cleanup()
  // The toolkit's query client is a module singleton shared by every mount.
  await queryClient.cancelQueries()
  queryClient.clear()
  queryClient.setDefaultOptions(CLIENT_DEFAULTS)
  setFormatLocale(undefined)
  const root = document.documentElement
  root.className = ""
  root.lang = ""
  root.removeAttribute("data-theme")
  root.removeAttribute("style")
  vi.unstubAllGlobals()
})

describe("ProfileGate", () => {
  it("fetches the profile feed through the host bridge, with no arguments", async () => {
    const callTool = vi.fn().mockResolvedValue(feedResult({ language: "en" }))
    renderGate(callTool)

    await waitFor(() => expect(callTool).toHaveBeenCalledWith(FEED, {}))
    expect(callTool).toHaveBeenCalledTimes(1)
  })

  it("provides the profile locale to the tree, the formatters and the document", async () => {
    renderGate(vi.fn().mockResolvedValue(feedResult({ language: "de" })))

    await waitFor(() => expect(probe()).toBe(probeFor("de")))
    expect(document.documentElement.lang).toBe("de")
  })

  it("holds the first paint while the profile loads — a localized skeleton, never English content", () => {
    renderGate(() => new Promise(() => {}), { host: { locale: "de-DE" } })

    expect(screen.queryByTestId("locale")).toBeNull()
    // The placeholder speaks the host's language already.
    expect(screen.getByRole("status").textContent).toBe("Wird geladen…")
    expect(document.documentElement.lang).toBe("de")
  })

  it("paints nothing at all until the host bridge is connected", () => {
    renderGate(() => new Promise(() => {}), { host: { connected: false } })

    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByTestId("locale")).toBeNull()
  })

  it("renders from the host context once the bounded wait is over", async () => {
    renderGate(() => new Promise(() => {}), { host: { locale: "de-AT" }, waitMs: 20 })

    await waitFor(() => expect(probe()).toBe(probeFor("de-AT")))
  })

  it("follows the host locale for a system profile, normalized to a shipped language", async () => {
    renderGate(vi.fn().mockResolvedValue(feedResult({ language: "system" })), {
      host: { locale: "de-AT", timeZone: "Asia/Tokyo" },
    })
    // The full host tag drives the dates, the language the strings; the
    // host's time zone applies to every formatted date.
    await waitFor(() => expect(probe()).toBe(probeFor("de-AT", "Asia/Tokyo")))
    expect(document.documentElement.lang).toBe("de")

    cleanup()
    queryClient.clear()
    renderGate(vi.fn().mockResolvedValue(feedResult({ language: "system" })), {
      host: { locale: "fr-FR" },
    })
    await waitFor(() => expect(probe()).toBe(probeFor("en")))
  })

  it("an explicit profile language beats the host locale", async () => {
    renderGate(vi.fn().mockResolvedValue(feedResult({ language: "en" })), {
      host: { locale: "de-DE" },
    })

    // English strings AND English dates — not the host's German conventions.
    await waitFor(() => expect(probe()).toBe(probeFor("en")))
    expect(document.documentElement.lang).toBe("en")
  })

  it("ignores a time zone the runtime does not know instead of breaking every date", async () => {
    renderGate(vi.fn().mockResolvedValue(feedResult({ language: "en" })), {
      host: { timeZone: "Mars/Olympus_Mons" },
    })

    await waitFor(() => expect(probe()).toBe(probeFor("en")))
  })

  it("applies an explicit profile theme over the host's and the OS's", async () => {
    stubOsPreference(false)
    renderGate(vi.fn().mockResolvedValue(feedResult({ theme: "dark" })), {
      host: { theme: "light" },
    })
    await waitFor(() => expect(probe()).not.toBeNull())
    expect(isDark()).toBe(true)

    cleanup()
    queryClient.clear()
    stubOsPreference(true)
    renderGate(vi.fn().mockResolvedValue(feedResult({ theme: "light" })), {
      host: { theme: "dark" },
    })
    await waitFor(() => expect(probe()).not.toBeNull())
    expect(isDark()).toBe(false)
  })

  it("follows the HOST theme for a system profile, even against the OS", async () => {
    stubOsPreference(false)
    renderGate(vi.fn().mockResolvedValue(feedResult({ theme: "system" })), {
      host: { theme: "dark" },
    })

    await waitFor(() => expect(probe()).not.toBeNull())
    expect(isDark()).toBe(true)
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
  })

  it("falls back to the host locale and the OS theme when the feed fails (e.g. the module is disabled)", async () => {
    stubOsPreference(true)
    failFast()
    const callTool = vi.fn().mockRejectedValue(new Error("unknown tool"))
    renderGate(callTool, { host: { locale: "de-DE" } })

    // A failed feed releases the gate at once — no wait for the bound.
    await waitFor(() => expect(gateQueryStatus()).toBe("error"))
    await waitFor(() => expect(probe()).toBe(probeFor("de-DE")))
    expect(callTool).toHaveBeenCalledTimes(1)
    expect(isDark()).toBe(true)
  })

  it("keys the query under the feed's module, so a module-wide invalidation flips the locale live", async () => {
    const callTool = vi
      .fn()
      .mockResolvedValueOnce(feedResult({ language: "en" }))
      .mockResolvedValue(feedResult({ language: "de" }))
    renderGate(callTool)
    await waitFor(() => expect(probe()).toBe(probeFor("en")))

    // What camunda7's refreshCockpitData does after a profile save.
    await act(async () => {
      await queryClient.invalidateQueries({
        predicate: (query) => String(query.queryKey[0]).startsWith("camunda7:"),
      })
    })

    // Strings and dates flip together — the tree stays mounted.
    await waitFor(() => expect(probe()).toBe(probeFor("de")))
    expect(document.documentElement.lang).toBe("de")
  })

  it("uses an explicit query key instead of the module default", async () => {
    renderGate(vi.fn().mockResolvedValue(feedResult({ language: "de" })), {
      queryKey: ["custom:gate"],
    })

    await waitFor(() => expect(probe()).toBe(probeFor("de")))
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey[0])
    expect(keys).toEqual(["custom:gate"])
  })
})
