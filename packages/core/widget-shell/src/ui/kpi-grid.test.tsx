// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { KpiGrid, KpiGridSkeleton } from "./kpi-grid.js"

afterEach(cleanup)

const classes = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/)

describe("KpiGrid: neutral digits, the state beside them", () => {
  it("strip: the number stays foreground, the tone is a dot next to the label", () => {
    render(
      <KpiGrid
        cells={[
          { label: "Open incidents", value: 18, tone: "danger" },
          { label: "Running", value: 40, tone: "neutral" },
        ]}
      />,
    )
    const value = screen.getByText("18")
    expect(classes(value)).toContain("text-foreground")
    expect(value.className).not.toMatch(/danger/)
    const label = screen.getByText("Open incidents").parentElement!
    expect(label.querySelector('[data-tone="danger"]')?.getAttribute("class")).toContain(
      "bg-danger",
    )
    expect(screen.getByText("Running").parentElement!.querySelector("[data-tone]")).toBeNull()
  })

  it("strip trend: neutral words, the state as a dot or a direction icon beside them", () => {
    render(
      <KpiGrid
        cells={[
          { label: "Jobs", value: 2, trend: "+2", trendTone: "warning" },
          { label: "Starts", value: 9, trend: "+1", trendDirection: "up" },
          { label: "Ends", value: 9, trend: "-3", trendDirection: "down", trendTone: "neutral" },
          { label: "Flat", value: 9, trend: "0", trendDirection: "flat" },
          { label: "Plain", value: 1, trend: "same" },
        ]}
      />,
    )
    const line = (text: string) => screen.getByText(text).parentElement!
    // An explicit tone without a direction: a dot in the tone.
    expect(classes(screen.getByText("+2"))).toContain("text-foreground")
    const dot = line("+2").querySelector("[data-trend-tone]")!
    expect(dot.getAttribute("data-trend-tone")).toBe("warning")
    expect(dot.getAttribute("aria-hidden")).toBe("true")
    expect(classes(dot)).toContain("bg-warning")
    // A direction: its Lucide icon in the direction's tone (up = worse).
    expect(classes(screen.getByText("+1"))).toContain("text-foreground")
    const up = line("+1").querySelector("svg.lucide-trending-up")!
    expect(classes(up)).toContain("text-danger")
    expect(up.getAttribute("aria-hidden")).toBe("true")
    // An explicit neutral tone wins over the direction; neutral words are muted.
    const down = line("-3").querySelector("svg.lucide-trending-down")!
    expect(classes(down)).toContain("text-muted-foreground")
    expect(classes(screen.getByText("-3"))).toContain("text-muted-foreground")
    expect(line("0").querySelector("svg.lucide-minus")).toBeTruthy()
    expect(classes(screen.getByText("same"))).toContain("text-muted-foreground")
    expect(line("same").querySelector("svg, [data-trend-tone]")).toBeNull()
    // No trend word is ever coloured.
    for (const text of ["+2", "+1", "-3", "0", "same"]) {
      expect(classes(screen.getByText(text)).join(" ")).not.toMatch(/-ink|text-(danger|warning)/)
    }
  })

  it("soft: tint + edge around neutral text; a clickable cell shows a Lucide chevron", () => {
    const onClick = vi.fn()
    const { container } = render(
      <KpiGrid
        variant="soft"
        cells={[
          { label: "Failed", value: 4, tone: "danger", onClick, ariaLabel: "Open failures" },
          { label: "Total", value: 12 },
        ]}
      />,
    )
    const failed = screen.getByRole("button", { name: "Open failures" })
    expect(classes(failed)).toEqual(
      expect.arrayContaining(["bg-danger-soft", "border-danger", "text-foreground"]),
    )
    expect(failed.querySelector("svg.lucide-chevron-right")).toBeTruthy()
    fireEvent.click(failed)
    expect(onClick).toHaveBeenCalledOnce()
    const total =
      container.querySelector('[data-tone=""]') ??
      screen.getByText("Total").closest("div.rounded-xl")
    expect(classes(total)).toEqual(expect.arrayContaining(["bg-muted", "border-border"]))
    expect(container.textContent).not.toContain("›")
  })
})

describe("KpiGrid geometry and header", () => {
  it("the skeleton mirrors both variants, boxed or not", () => {
    const { container, rerender } = render(<KpiGridSkeleton cells={4} />)
    expect(container.firstElementChild!.getAttribute("aria-busy")).toBe("true")
    expect(container.querySelectorAll(".bg-card")).toHaveLength(4)
    rerender(<KpiGridSkeleton cells={3} variant="soft" />)
    expect(container.querySelectorAll(".rounded-xl")).toHaveLength(3)
    rerender(<KpiGridSkeleton cells={2} boxed />)
    expect(classes(container.firstElementChild)).toContain("rounded-lg")
  })

  it("a boxed strip carries its group header and badge", () => {
    render(
      <KpiGrid
        boxed
        ariaLabel="Health"
        header={{ label: "Health", badge: "live" }}
        cells={[{ label: "Up", value: 1, onClick: () => {}, ariaLabel: "Open up" }]}
      />,
    )
    expect(screen.getByRole("group", { name: "Health" })).toBeTruthy()
    expect(screen.getByText("live")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Open up" }).querySelector("svg.lucide-chevron-right"),
    ).toBeTruthy()
  })
})
