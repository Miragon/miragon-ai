// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { DisplayModeProvider, WidgetShell, useHostDisplayMode } from "./widget-shell.js"

afterEach(cleanup)

/** The frame div that carries the max-width — the content's direct parent. */
const frameOf = (testId: string) => screen.getByTestId(testId).parentElement!

describe("WidgetShell", () => {
  it("caps the width inline and lets a fullscreen host have it all", () => {
    render(
      <>
        <WidgetShell>
          <p data-testid="inline">a</p>
        </WidgetShell>
        <DisplayModeProvider mode="fullscreen">
          <WidgetShell>
            <p data-testid="fullscreen">b</p>
          </WidgetShell>
        </DisplayModeProvider>
      </>,
    )

    expect(frameOf("inline").className).toContain("max-w-7xl")
    expect(frameOf("fullscreen").className).toContain("max-w-full")
  })

  it("nested under another shell keeps only the section stack", () => {
    render(
      <WidgetShell>
        <WidgetShell className="extra">
          <p data-testid="inner">c</p>
        </WidgetShell>
      </WidgetShell>,
    )

    const inner = frameOf("inner")
    expect(inner.className).toBe("flex flex-col gap-6 extra")
    // Exactly one card surface: the outer shell's.
    expect(document.querySelectorAll(".bg-card")).toHaveLength(1)
  })
})

describe("useHostDisplayMode", () => {
  function Mode() {
    return <span data-testid="mode">{useHostDisplayMode()}</span>
  }

  it('defaults to "inline" outside a host and reports the provided mode inside one', () => {
    render(
      <>
        <Mode />
        <DisplayModeProvider mode="pip">
          <Mode />
        </DisplayModeProvider>
      </>,
    )

    const [outside, inside] = screen.getAllByTestId("mode")
    expect(outside.textContent).toBe("inline")
    expect(inside.textContent).toBe("pip")
  })
})
