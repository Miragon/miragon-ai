// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { LocaleProvider } from "@miragon/mcp-toolkit-ui"
import { HostBridgeProvider, type HostBridge } from "@miragon/mcp-toolkit-ui/app"
import { TriangleAlert } from "lucide-react"
import { FilterBar } from "./filter-bar.js"
import { Icon } from "./icon.js"
import { OpenInCockpitLink } from "./open-in-cockpit-link.js"
import { CountPill, LivePill, StatusBadge } from "./pills.js"
import { Section } from "./section.js"
import { SegmentedControl } from "./segmented-control.js"
import { DEFAULT_HEATMAP_LABELS } from "./bpmn-heatmap-labels.js"
import {
  MICRO_LABEL,
  TONE_BORDER,
  TONE_DOT,
  TONE_ICON,
  TONE_INK,
  TONE_SOFT,
  TONE_TINT,
  TONE_VARIANTS,
} from "./tone-utils.js"
import { WidgetHeader } from "./widget-header.js"

afterEach(cleanup)

const classes = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/)

describe("the tone model (tone-utils)", () => {
  it("has the five tones and no critical", () => {
    expect(TONE_VARIANTS).toEqual(["danger", "warning", "success", "info", "neutral"])
    for (const map of [TONE_SOFT, TONE_TINT, TONE_DOT, TONE_BORDER, TONE_ICON, TONE_INK]) {
      expect(Object.keys(map).sort()).toEqual([...TONE_VARIANTS].sort())
      expect(Object.values(map).join(" ")).not.toMatch(/critical|m-blue|m-green/)
    }
  })

  it("pins every class string (one place to change a tone)", () => {
    expect({ TONE_SOFT, TONE_TINT, TONE_DOT, TONE_BORDER, TONE_ICON, TONE_INK }).toEqual({
      TONE_SOFT: {
        danger: "bg-danger-soft text-foreground",
        warning: "bg-warning-soft text-foreground",
        success: "bg-success-soft text-foreground",
        info: "bg-info-soft text-foreground",
        neutral: "bg-muted text-foreground",
      },
      TONE_TINT: {
        danger: "bg-danger-soft",
        warning: "bg-warning-soft",
        success: "bg-success-soft",
        info: "bg-info-soft",
        neutral: "bg-muted",
      },
      TONE_DOT: {
        danger: "bg-danger",
        warning: "bg-warning",
        success: "bg-success",
        info: "bg-info",
        neutral: "bg-muted-foreground",
      },
      TONE_BORDER: {
        danger: "border-danger",
        warning: "border-warning",
        success: "border-success",
        info: "border-info",
        neutral: "border-border",
      },
      TONE_ICON: {
        danger: "text-danger",
        warning: "text-warning",
        success: "text-success",
        info: "text-info",
        neutral: "text-muted-foreground",
      },
      TONE_INK: {
        danger: "text-danger-ink",
        warning: "text-warning-ink",
        success: "text-success-ink",
        info: "text-info-ink",
        neutral: "text-muted-foreground",
      },
    })
    expect(MICRO_LABEL).toBe("text-[11px] font-semibold uppercase tracking-wide")
  })

  it("puts black words on a tint and the tone on fills, edges and icons (CI §3.3)", () => {
    for (const tone of TONE_VARIANTS) {
      expect(TONE_SOFT[tone]).toBe(`${TONE_TINT[tone]} text-foreground`)
      expect(TONE_DOT[tone]).toMatch(/^bg-/)
      expect(TONE_BORDER[tone]).toMatch(/^border-/)
      expect(TONE_ICON[tone]).toMatch(/^text-/)
    }
    for (const tone of ["danger", "warning", "success", "info"] as const) {
      expect(TONE_INK[tone]).toBe(`text-${tone}-ink`)
    }
  })
})

/** Every class of an element and its descendants. */
const allClasses = (el: Element) =>
  [el, ...el.querySelectorAll("*")].flatMap((node) => classes(node)).join(" ")

describe("pills", () => {
  it("StatusBadge: tint, edge and a decorative dot next to black text (default danger)", () => {
    render(<StatusBadge>Offen</StatusBadge>)
    const badge = screen.getByText("Offen")
    expect(classes(badge)).toEqual(
      expect.arrayContaining(["bg-danger-soft", "text-foreground", "border-danger"]),
    )
    expect(allClasses(badge)).not.toMatch(/text-danger/)
    const dot = badge.querySelector("span")!
    expect(dot.getAttribute("aria-hidden")).toBe("true")
    expect(classes(dot)).toContain("bg-danger")
  })

  it("CountPill: neutral unless a state is given, and its digits are never coloured", () => {
    render(
      <>
        <CountPill>7</CountPill>
        <CountPill tone="warning">3</CountPill>
        <CountPill tone="danger">12</CountPill>
      </>,
    )
    expect(classes(screen.getByText("7"))).toEqual(
      expect.arrayContaining(["bg-muted", "text-foreground"]),
    )
    expect(classes(screen.getByText("3"))).toEqual(
      expect.arrayContaining(["bg-warning-soft", "text-foreground", "border-warning"]),
    )
    const danger = screen.getByText("12")
    expect(classes(danger)).toEqual(
      expect.arrayContaining(["bg-danger-soft", "text-foreground", "border-danger"]),
    )
    expect(allClasses(danger)).not.toMatch(/text-(danger|warning|success|info)/)
  })

  it("LivePill: black text on the tint, the dot pulses only without reduced motion", () => {
    render(<LivePill>Live</LivePill>)
    const pill = screen.getByText("Live")
    expect(classes(pill)).toEqual(
      expect.arrayContaining(["bg-info-soft", "text-foreground", "border-info"]),
    )
    const pulse = pill.querySelector("span")!
    expect(classes(pulse)).toContain("motion-safe:animate-pulse")
    expect(classes(pulse)).not.toContain("animate-pulse")
  })
})

describe("heatmap defaults", () => {
  it("pins the English fallback strings", () => {
    expect(DEFAULT_HEATMAP_LABELS).toEqual({
      title: "BPMN heatmap",
      window: "window:",
      frequency: "Frequency",
      duration: "Duration",
      frequencyLegend: "Executions per element",
      durationLegend: "Avg duration per element (s)",
      noData: "No heatmap data.",
      noHeat: "No metric data in this window.",
      bpmnUnavailable:
        "BPMN diagram unavailable: the analytics module has no camunda7 client configured to fetch it.",
      less: "Less",
      more: "More",
      diagramAriaLabel: "BPMN process diagram with an execution heat overlay",
      errorTitle: "Diagram could not be rendered",
    })
  })
})

describe("selection in the info tone (CI: blue contour + tint, black text)", () => {
  it("FilterBar: an active chip is the info tint and edge around black text, with aria-pressed", () => {
    const onSearchChange = vi.fn()
    const onChipToggle = vi.fn()
    render(
      <FilterBar
        search=""
        onSearchChange={onSearchChange}
        chips={[
          { id: "a", label: "Offen", count: 3, active: true },
          { id: "b", label: "Erledigt" },
        ]}
        onChipToggle={onChipToggle}
      />,
    )
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "inv" } })
    expect(onSearchChange).toHaveBeenCalledWith("inv")
    fireEvent.click(screen.getByRole("button", { name: "Erledigt" }))
    expect(onChipToggle).toHaveBeenCalledWith("b")
    const active = screen.getByRole("button", { name: /Offen/ })
    expect(active.getAttribute("aria-pressed")).toBe("true")
    expect(classes(active)).toEqual(
      expect.arrayContaining(["bg-info-soft", "text-foreground", "border-info"]),
    )
    expect(allClasses(active)).not.toMatch(/text-info/)
    expect(classes(screen.getByText("3"))).not.toContain("opacity-60")
    expect(classes(screen.getByRole("searchbox"))).toEqual(
      expect.arrayContaining([
        "border-input",
        "focus-visible:ring-focus",
        "focus-visible:border-focus",
      ]),
    )
  })

  it("SegmentedControl: the pressed segment is the info tint and an inset info contour", () => {
    render(
      <SegmentedControl
        options={[
          { value: "f", label: "Frequenz" },
          { value: "d", label: "Dauer" },
        ]}
        value="d"
        onChange={() => {}}
      />,
    )
    const pressed = screen.getByRole("button", { name: "Dauer" })
    expect(classes(pressed)).toEqual(
      expect.arrayContaining([
        "bg-info-soft",
        "text-foreground",
        "ring-1",
        "ring-inset",
        "ring-info",
      ]),
    )
    expect(classes(pressed)).toContain("focus-visible:ring-focus")
    expect(classes(screen.getByRole("button", { name: "Frequenz" }))).not.toContain("ring-info")
  })
})

describe("icons", () => {
  it("Icon: decorative 16 px by default, named when it stands alone, stroke density opt-in", () => {
    const { container } = render(
      <>
        <Icon icon={TriangleAlert} />
        <Icon icon={TriangleAlert} label="Warnung" dense size={24} />
      </>,
    )
    const [plain, named] = [...container.querySelectorAll("svg")]
    expect(plain.getAttribute("aria-hidden")).toBe("true")
    expect(plain.getAttribute("width")).toBe("16")
    expect(plain.hasAttribute("data-icon-density")).toBe(false)
    expect(screen.getByRole("img", { name: "Warnung" })).toBe(named)
    expect(named.getAttribute("width")).toBe("24")
    expect(named.getAttribute("data-icon-density")).toBe("dense")
  })

  it("Section rotates a Lucide chevron when open and reports the toggle", () => {
    const onToggle = vi.fn()
    const { container } = render(
      <Section title="Variablen" count={2} onToggle={onToggle}>
        x
      </Section>,
    )
    const chevron = container.querySelector("summary svg.lucide-chevron-right")!
    expect(chevron.getAttribute("class")).toContain("[[open]>summary>&]:rotate-90")
    const details = container.querySelector("details")!
    details.open = true
    fireEvent(details, new Event("toggle"))
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it("WidgetHeader has no icon tile, only title, badge and subtitle", () => {
    const { container } = render(
      <WidgetHeader
        title="Übersicht"
        badge={<StatusBadge tone="warning">Eingeschränkt</StatusBadge>}
        sub="Stand 14:32"
      />,
    )
    expect(screen.getByRole("heading", { level: 1, name: "Übersicht" })).toBeTruthy()
    expect(container.querySelector(".size-11")).toBeNull()
  })
})

describe("OpenInCockpitLink", () => {
  function renderLink(locale: string, props: { vendor?: string; label?: string }) {
    const openExternal = vi.fn()
    const bridge: HostBridge = {
      callTool: vi.fn(),
      sendFollowup: vi.fn(),
      openExternal,
      getWidgetData: () => null,
    }
    render(
      <HostBridgeProvider bridge={bridge}>
        <LocaleProvider locale={locale}>
          <OpenInCockpitLink url="https://engine.example/cockpit" {...props} />
        </LocaleProvider>
      </HostBridgeProvider>,
    )
    return openExternal
  }

  it("is named after the vendor and says that it opens a new tab", () => {
    renderLink("de", { vendor: "CIB seven" })
    const link = screen.getByRole("link", { name: "In CIB seven öffnen, öffnet in neuem Tab" })
    expect(link.textContent).toBe("In CIB seven öffnen")
    expect(link.querySelector("svg.lucide-external-link")?.getAttribute("aria-hidden")).toBe("true")
    expect(link.className).not.toContain("text-muted-foreground")
  })

  it("falls back to the engine cockpit and honours a caller's label, in English", () => {
    renderLink("en", {})
    expect(
      screen.getByRole("link", { name: "Open in engine cockpit (opens in a new tab)" }),
    ).toBeTruthy()
    cleanup()
    const openExternal = renderLink("en", {
      label: "Open instance in Camunda 7",
      vendor: "Camunda 7",
    })
    const link = screen.getByRole("link", {
      name: "Open instance in Camunda 7 (opens in a new tab)",
    })
    fireEvent.click(link)
    expect(openExternal).toHaveBeenCalledWith("https://engine.example/cockpit")
  })
})
