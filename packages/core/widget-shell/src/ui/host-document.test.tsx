// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { LocaleProvider } from "@miragon/mcp-toolkit-ui"
import { HostDocument } from "./host-document.js"
import { fullscreenAvailable } from "./localized-app-view.js"
import { BpmnZoomControls } from "./bpmn-zoom-controls.js"
import { ShellHostProvider, type ShellHost } from "./shell-host.js"

const BASE: ShellHost = { connected: true, displayMode: "inline", availableDisplayModes: [] }

function renderDocument(host: Partial<ShellHost>) {
  return render(
    <ShellHostProvider host={{ ...BASE, ...host }}>
      <HostDocument>
        <p data-testid="content">content</p>
      </HostDocument>
    </ShellHostProvider>,
  )
}

const wrapper = () => screen.getByTestId("content").parentElement!

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute("style")
  document.body.removeAttribute("style")
  document.getElementById("__mcp-host-fonts")?.remove()
})

describe("HostDocument", () => {
  it("lets an inline view size to its content — no box, no floor", () => {
    renderDocument({})
    expect(wrapper().style.display).toBe("contents")
    expect(wrapper().style.maxHeight).toBe("")
    expect(document.documentElement.style.height).toBe("")
  })

  it("scrolls inside the host's height budget instead of being clipped", () => {
    renderDocument({ maxHeight: 320 })
    expect(wrapper().style.maxHeight).toBe("320px")
    expect(wrapper().style.overflowY).toBe("auto")
  })

  it("fills the viewport in fullscreen and PiP, and restores the document on exit", () => {
    const { unmount } = renderDocument({ displayMode: "fullscreen", maxHeight: 320 })
    expect(document.documentElement.style.height).toBe("100%")
    expect(document.body.style.minHeight).toBe("100%")
    expect(wrapper().style.display).toBe("flex")
    unmount()
    expect(document.documentElement.style.height).toBe("")

    renderDocument({ displayMode: "pip" })
    expect(document.body.style.height).toBe("100%")
  })

  it("applies the host's style variables to <html> and injects its font CSS once", () => {
    renderDocument({
      styleVariables: { "--font-sans": "HostSans", "--font-mono": undefined },
      fontCss: "@font-face { font-family: HostSans; src: local(Arial); }",
    })
    expect(document.documentElement.style.getPropertyValue("--font-sans")).toBe("HostSans")
    expect(document.documentElement.style.getPropertyValue("--font-mono")).toBe("")
    cleanup()
    renderDocument({ fontCss: "@font-face { font-family: Other; src: local(Arial); }" })
    expect(document.querySelectorAll("#__mcp-host-fonts")).toHaveLength(1)
  })
})

describe("fullscreenAvailable", () => {
  it("offers the toggle only where the host offers fullscreen — or the view is already there", () => {
    expect(fullscreenAvailable({ displayMode: "inline", availableDisplayModes: ["inline"] })).toBe(
      false,
    )
    expect(fullscreenAvailable({ displayMode: "inline", availableDisplayModes: [] })).toBe(false)
    expect(
      fullscreenAvailable({
        displayMode: "inline",
        availableDisplayModes: ["inline", "fullscreen"],
      }),
    ).toBe(true)
    expect(fullscreenAvailable({ displayMode: "fullscreen", availableDisplayModes: [] })).toBe(true)
  })
})

describe("BpmnZoomControls", () => {
  const noop = () => {}

  it("names its buttons in the active locale, overridable per prop", () => {
    render(
      <LocaleProvider locale="de">
        <BpmnZoomControls
          onZoomIn={noop}
          onZoomOut={noop}
          onFit={noop}
          labels={{ fit: "Passend" }}
        />
      </LocaleProvider>,
    )
    expect(screen.getByRole("button", { name: "Vergrößern" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Verkleinern" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Passend" })).toBeTruthy()
  })

  it("sits top-right, clear of the bpmn.io logo bpmn-js pins bottom-right", () => {
    render(<BpmnZoomControls onZoomIn={noop} onZoomOut={noop} onFit={noop} />)
    const bar = screen.getByRole("button", { name: "Zoom in" }).parentElement!
    expect(bar.className).toContain("top-3")
    expect(bar.className).not.toContain("bottom-")
  })
})
