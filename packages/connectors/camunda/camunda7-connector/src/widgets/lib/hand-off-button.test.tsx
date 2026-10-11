// @vitest-environment happy-dom
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render as rtlRender, screen } from "@testing-library/react"
import { LocaleProvider } from "@miragon/mcp-toolkit-ui"
import { HostBridgeProvider, type HostBridge } from "@miragon/mcp-toolkit-ui/app"
import { askAiPrompt } from "@miragon-ai/widget-shell/widgets"
import { translator } from "../../messages/index.js"
import { HAND_OFF_ACTIONS, HandOffButton, type HandOffAction } from "./hand-off-button.js"

afterEach(cleanup)

const bridge: HostBridge = {
  callTool: vi.fn(),
  sendFollowup: vi.fn(),
  openExternal: vi.fn(),
  getWidgetData: () => null,
}

/** The button posts through the host bridge; a minimal one is enough to render it. */
const render = (ui: ReactNode) =>
  rtlRender(<HostBridgeProvider bridge={bridge}>{ui}</HostBridgeProvider>)

const prompt = askAiPrompt({
  intent: "Explain this.",
  locale: "en",
  ids: { incidentId: "i1" },
  surface: { has: () => true },
})

/** lucide-react's class for an icon component: `lucide-` + its name in kebab case. */
const lucideClass = (name: string) =>
  `lucide-${name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`

const ACTIONS = Object.keys(HAND_OFF_ACTIONS) as HandOffAction[]

describe("HandOffButton: the icon of the function and a verb that names the chat", () => {
  it.each(ACTIONS.flatMap((action) => [[action, "en"] as const, [action, "de"] as const]))(
    "%s (%s)",
    (action, locale) => {
      const label = translator(locale, `handOff.${action}`)
      // Every label is translated and says where the work happens.
      expect(label).not.toBe(`handOff.${action}`)
      expect(label).toMatch(locale === "de" ? /im Chat/i : /in chat/)
      const { container } = render(
        <LocaleProvider locale={locale}>
          <HandOffButton action={action} prompt={prompt} />
        </LocaleProvider>,
      )
      expect(screen.getByRole("button", { name: label })).toBeTruthy()
      const svg = container.querySelector("svg")!
      expect(svg.getAttribute("class")).toContain(
        lucideClass(HAND_OFF_ACTIONS[action].displayName!),
      )
      expect(svg.getAttribute("aria-hidden")).toBe("true")
    },
  )

  it("an icon-only row keeps the label as the accessible name and tooltip", () => {
    render(
      <LocaleProvider locale="de">
        <HandOffButton action="draftTicket" variant="icon" prompt={prompt} />
      </LocaleProvider>,
    )
    const button = screen.getByRole("button", { name: "Ticket im Chat entwerfen" })
    expect(button.getAttribute("title")).toBe("Ticket im Chat entwerfen")
    expect(button.textContent).toBe("")
  })

  it("renders nothing for a hand-off this deployment cannot offer", () => {
    const { container } = render(<HandOffButton action="planFix" prompt={null} />)
    expect(container.querySelector("button")).toBeNull()
  })

  it("no two functions share an icon (two hand-offs in one row stay distinguishable)", () => {
    const icons = Object.values(HAND_OFF_ACTIONS)
    expect(new Set(icons).size).toBe(icons.length)
  })
})
