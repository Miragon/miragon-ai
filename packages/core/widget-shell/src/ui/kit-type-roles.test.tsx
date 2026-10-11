// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { BpmnZoomControls } from "./bpmn-zoom-controls.js"
import { LogText } from "./log-text.js"
import { NativeSelect } from "./native-select.js"
import { RowCard } from "./row-card.js"
import { Section } from "./section.js"
import { SettingsCard, SettingsField, SettingsInput } from "./settings.js"
import { VersionChip } from "./table.js"
import { ViewMeta } from "./view-meta.js"
import { viewErrorDescriber } from "./localized-app-view.js"

/**
 * The kit on the CI's type roles (modeler-tool-design §4 as the toolkit's
 * TYPE_SCALE): a section 21/600 (`text-section`), running text 16
 * (`text-body`), dense tables and controls 14 (`text-dense`), captions 13
 * (`text-small`) — nothing smaller. `brand-gates.test.ts` scans the whole
 * kit for sizes off the scale; these pin the role each piece takes.
 */

afterEach(cleanup)

const classes = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/)

describe("kit type roles", () => {
  it("a Section heading is the section step (21 px / 600), its summary keyboard-visible", () => {
    render(
      <Section title="Variables" count={3}>
        <p>body</p>
      </Section>,
    )
    const heading = screen.getByRole("heading", { level: 3, name: "Variables" })
    expect(classes(heading)).toContain("text-section")
    expect(classes(heading.closest("summary"))).toContain("focus-visible:ring-focus")
  })

  it("a settings card titles as a section; labels are dense, help a caption", () => {
    render(
      <SettingsCard title="Defaults">
        <SettingsField label="Period" help="Used when a view names none.">
          <SettingsInput defaultValue="7d" />
        </SettingsField>
      </SettingsCard>,
    )
    expect(classes(screen.getByRole("heading", { name: "Defaults" }))).toContain("text-section")
    expect(classes(screen.getByText("Period"))).toContain("text-dense")
    expect(classes(screen.getByText("Used when a view names none."))).toContain("text-small")
  })

  it("form controls take the 3:1 input edge, the dense step and the toolkit's focus ring", () => {
    render(
      <>
        <SettingsInput aria-label="input" />
        <NativeSelect aria-label="select">
          <option>a</option>
        </NativeSelect>
      </>,
    )
    for (const control of [screen.getByLabelText("input"), screen.getByLabelText("select")]) {
      const c = classes(control)
      expect(c).toContain("border-input")
      expect(c).not.toContain("border-border")
      expect(c).toContain("text-dense")
      expect(c).toContain("focus-visible:ring-focus")
    }
  })

  it("meta rows, log text, version chips and row-card subtitles are captions (13 px)", () => {
    render(
      <>
        <ViewMeta subject="Invoice" />
        <LogText text="NullPointerException" />
        <VersionChip version={3} />
        <RowCard title="Order" subtitle="v3 · 12 running" />
      </>,
    )
    expect(classes(screen.getByText("Invoice"))).toContain("text-small")
    expect(classes(screen.getByText("NullPointerException"))).toContain("text-small")
    expect(classes(screen.getByText("v3"))).toContain("text-small")
    expect(classes(screen.getByText("v3 · 12 running"))).toContain("text-small")
    expect(classes(screen.getByText("Order"))).toContain("text-dense")
  })
})

describe("BpmnZoomControls (CI §8, §10: chrome over the paper stays light)", () => {
  it("is a forced-light island of 32 px icon buttons with Lucide icons and names", () => {
    const { container } = render(
      <BpmnZoomControls onZoomIn={vi.fn()} onZoomOut={vi.fn()} onFit={vi.fn()} />,
    )
    const bar = container.firstElementChild!
    expect(bar.getAttribute("data-theme-mode")).toBe("light")
    expect(classes(bar)).toContain("rounded-md")
    for (const name of ["Zoom in", "Fit to viewport", "Zoom out"]) {
      const button = screen.getByRole("button", { name })
      expect(classes(button)).toContain("size-8")
      expect(button.querySelector("svg.lucide")).toBeTruthy()
    }
  })
})

describe("viewErrorDescriber (the view's own failed call, U1)", () => {
  it("words a classified reason and leaves the rest to the toolkit", () => {
    const describe = viewErrorDescriber("de")
    expect(describe("[503 ProcessEngineException] down (engine prod)", { kind: "failed" })).toEqual(
      {
        title: "Die Engine prod ist nicht erreichbar (HTTP 503)",
        description: "Prüf, ob die Engine läuft, oder wähl eine andere Engine.",
      },
    )
    expect(describe("odd", { kind: "failed" })).toBeUndefined()
    expect(describe(undefined, { kind: "failed" })).toBeUndefined()
    // A result the chat did not pass on is no failure: the toolkit's words.
    expect(describe("[503] x", { kind: "blocked" })).toBeUndefined()
  })
})
