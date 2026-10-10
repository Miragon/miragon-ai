// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import { bootstrapView, disposeView } from "mcp-use/react"
import { queryClient, useLocale } from "@miragon/mcp-toolkit-ui"
import { useHostBridge, type WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import { AppShellProviders } from "./app-shell-providers.js"
import { useHostWidgets } from "./host-widgets.js"
import { useHostDisplayMode } from "./widget-shell.js"

// The REAL mcp-use view runtime (bootstrapView), connected to an in-memory
// SEP-1865 host through its transport seam instead of window.parent — so the
// provider stack runs exactly as in the bundle, hooks and all, without a
// browser. (No @testing-library render: bootstrapView owns the React root.)

type ViewTransport = NonNullable<NonNullable<Parameters<typeof bootstrapView>[1]>["transport"]>

interface Message {
  jsonrpc: "2.0"
  id?: string | number
  method?: string
  params?: Record<string, unknown>
}

const PROFILE_FEED = "camunda7_user_profile_data"

function profileResult(profile: { language?: string; theme?: string }) {
  return {
    content: [{ type: "text", text: JSON.stringify({ profile }) }],
    structuredContent: { profile },
  }
}

/** A minimal host: answers `ui/initialize` and `tools/call`, records everything the view sent. */
function createFakeHost(options: {
  hostContext: Record<string, unknown>
  hostCapabilities?: Record<string, unknown>
  tools?: Record<string, unknown>
}) {
  const sent: Message[] = []
  const transport = {
    onmessage: undefined as ((message: Message) => void) | undefined,
    onclose: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    start: () => Promise.resolve(),
    close: () => {
      transport.onclose?.()
      return Promise.resolve()
    },
    send: (message: Message) => {
      sent.push(message)
      if (message.id !== undefined && message.method) {
        const reply = answer(message)
        queueMicrotask(() => transport.onmessage?.({ jsonrpc: "2.0", id: message.id, ...reply }))
      }
      return Promise.resolve()
    },
  }

  function answer(message: Message): { result: unknown } | { error: unknown } {
    if (message.method === "ui/initialize") {
      return {
        result: {
          protocolVersion: message.params?.protocolVersion,
          hostInfo: { name: "fake-host", version: "1.0.0" },
          hostCapabilities: options.hostCapabilities ?? {
            serverTools: {},
            updateModelContext: { text: {} },
          },
          hostContext: options.hostContext,
        },
      }
    }
    if (message.method === "tools/call") {
      const result = options.tools?.[String(message.params?.name)]
      if (result) return { result }
      return { error: { code: -32602, message: `unknown tool ${String(message.params?.name)}` } }
    }
    return { result: {} }
  }

  return {
    transport: transport as unknown as ViewTransport,
    toolCalls: () =>
      sent
        .filter((m) => m.method === "tools/call")
        .map((m) => ({ name: m.params?.name, arguments: m.params?.arguments })),
    notify: (method: string, params: Record<string, unknown>) =>
      transport.onmessage?.({ jsonrpc: "2.0", method, params }),
  }
}

const DemoWidget: WidgetComponent = () => null

/** Everything the stack provides, in one line: locale | display mode | registry. */
function Probe() {
  // Throws without the host bridge above — part of what is under test.
  useHostBridge()
  const widgets = Object.keys(useHostWidgets()).join(",")
  return <output data-testid="probe">{`${useLocale()}|${useHostDisplayMode()}|${widgets}`}</output>
}

function mount(host: ReturnType<typeof createFakeHost>) {
  bootstrapView(
    {
      default: () => (
        <AppShellProviders widgets={{ "demo:widget": DemoWidget }} profileTool={PROFILE_FEED}>
          <Probe />
        </AppShellProviders>
      ),
    },
    { transport: host.transport },
  )
}

const probe = () => document.querySelector("[data-testid=probe]")?.textContent
const root = document.documentElement

afterEach(async () => {
  await disposeView()
  document.getElementById("root")?.remove()
  // The toolkit's query client is a module singleton shared by every mount —
  // the suite runs on its PRODUCTION defaults (react-query's retries
  // included); cancelling stops any retry still waiting.
  await queryClient.cancelQueries()
  queryClient.clear()
  root.className = ""
  root.lang = ""
  root.removeAttribute("data-theme")
  root.removeAttribute("style")
  vi.unstubAllGlobals()
})

describe("AppShellProviders (real mcp-use view runtime)", () => {
  it("wires host bridge → display mode → profile → widget registry, in that order", async () => {
    const host = createFakeHost({
      hostContext: {
        theme: "dark",
        displayMode: "fullscreen",
        availableDisplayModes: ["inline", "fullscreen"],
      },
      tools: { [PROFILE_FEED]: profileResult({ language: "de", theme: "dark" }) },
    })
    mount(host)

    // ProfileGate reached the host through the bridge ABOVE it (the profile
    // locale arrived), the display mode came from the view scope, and the
    // registry is provided below the gate.
    await vi.waitFor(() => expect(probe()).toBe("de|fullscreen|demo:widget"))
    expect(host.toolCalls()).toEqual([{ name: PROFILE_FEED, arguments: {} }])
    // Profile language and theme are applied document-wide — one theme on
    // every channel the CSS, the host and native controls read.
    expect(root.lang).toBe("de")
    expect(root.classList.contains("dark")).toBe(true)
    expect(root.getAttribute("data-theme")).toBe("dark")
    expect(root.style.getPropertyValue("color-scheme")).toBe("dark")
  })

  it("follows the HOST's theme and locale for a system profile — over a light OS and English defaults (#339)", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
    const host = createFakeHost({
      hostContext: { theme: "dark", locale: "de-DE" },
      tools: { [PROFILE_FEED]: profileResult({ language: "system", theme: "system" }) },
    })
    mount(host)

    await vi.waitFor(() => expect(probe()).toBe("de|inline|demo:widget"))
    expect(root.lang).toBe("de")
    expect(root.classList.contains("dark")).toBe(true)
    expect(root.getAttribute("data-theme")).toBe("dark")
  })

  it("puts the host's style variables and font on the document, and fills it in fullscreen", async () => {
    const host = createFakeHost({
      hostContext: {
        theme: "light",
        displayMode: "fullscreen",
        availableDisplayModes: ["inline", "fullscreen"],
        styles: {
          variables: { "--font-sans": "HostSans, sans-serif", "--font-mono": "HostMono" },
          css: { fonts: "@font-face { font-family: HostSans; src: local(Arial); }" },
        },
      },
      tools: { [PROFILE_FEED]: profileResult({ language: "en" }) },
    })
    mount(host)

    await vi.waitFor(() => expect(probe()).toBe("en|fullscreen|demo:widget"))
    // Tailwind's font utilities read these variables: the host's font wins.
    expect(root.style.getPropertyValue("--font-sans")).toBe("HostSans, sans-serif")
    expect(root.style.getPropertyValue("--font-mono")).toBe("HostMono")
    expect(document.getElementById("__mcp-host-fonts")?.textContent).toContain("HostSans")
    expect(root.style.height).toBe("100%")
    document.getElementById("__mcp-host-fonts")?.remove()
  })

  it("follows a host display-mode change live", async () => {
    const host = createFakeHost({
      hostContext: { displayMode: "fullscreen", availableDisplayModes: ["inline", "fullscreen"] },
      tools: { [PROFILE_FEED]: profileResult({ language: "en" }) },
    })
    mount(host)
    await vi.waitFor(() => expect(probe()).toBe("en|fullscreen|demo:widget"))

    host.notify("ui/notifications/host-context-changed", { displayMode: "inline" })

    await vi.waitFor(() => expect(probe()).toBe("en|inline|demo:widget"))
  })

  it("still renders, in English and the OS theme, on a host that cannot call server tools", async () => {
    // No `serverTools` capability: every tool call (the profile feed
    // included) rejects inside the guest — the gate must degrade, not crash,
    // and not wait out react-query's retries (the toolkit's client keeps the
    // default 3, ~7 s of backoff): the first failure releases it.
    // A dark OS, so the theme fallback is observable (light is the default).
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
    const host = createFakeHost({ hostContext: {}, hostCapabilities: {} })
    mount(host)

    // Within 1 s — inside the gate's 1.5 s profile bound, so the bound cannot
    // be what released it …
    await vi.waitFor(() => expect(probe()).toBe("en|inline|demo:widget"), { timeout: 1_000 })
    // … while the retries still run: the query is pending after one failure.
    expect(queryClient.getQueryState(["camunda7:profile-gate", {}])).toMatchObject({
      status: "pending",
      fetchFailureCount: 1,
    })
    expect(host.toolCalls()).toEqual([])
    expect(root.lang).toBe("en")
    expect(root.classList.contains("dark")).toBe(true)
  })
})
