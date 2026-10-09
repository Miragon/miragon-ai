// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { LocaleProvider } from "@miragon/mcp-toolkit-ui"
import { HostBridgeProvider, type HostBridge } from "@miragon/mcp-toolkit-ui/app"
import { AskAiButton } from "./ask-ai-button.js"
import { askAiPrompt, type AskAiPrompt } from "./ask-ai-prompt.js"

afterEach(cleanup)

function renderButton(prompt: AskAiPrompt | null, locale = "en") {
  const sendFollowup = vi.fn()
  const bridge: HostBridge = {
    callTool: vi.fn(),
    sendFollowup,
    openExternal: vi.fn(),
    getWidgetData: () => null,
  }
  const view = render(
    <HostBridgeProvider bridge={bridge}>
      <LocaleProvider locale={locale}>
        <AskAiButton prompt={prompt} />
      </LocaleProvider>
    </HostBridgeProvider>,
  )
  return { ...view, sendFollowup }
}

describe("AskAiButton", () => {
  it("posts the built hand-off unchanged as the follow-up", () => {
    const prompt = askAiPrompt({
      intent: "Explain this.",
      locale: "en",
      ids: { incidentId: "i1" },
      surface: { has: () => true },
    })
    const { sendFollowup } = renderButton(prompt)
    fireEvent.click(screen.getByRole("button", { name: /Analyze/ }))
    expect(sendFollowup).toHaveBeenCalledWith('Explain this.\nIds: incidentId="i1"')
  })

  it("renders nothing for a hand-off with nothing available in this deployment", () => {
    const { container } = renderButton(null)
    expect(container.querySelector("button")).toBeNull()
  })

  it("defaults its verb to the locale", () => {
    renderButton(askAiPrompt({ intent: "x", locale: "de", surface: { has: () => true } }), "de")
    expect(screen.getByRole("button", { name: /Analysieren/ })).toBeTruthy()
  })
})
