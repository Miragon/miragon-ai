// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import {
  COLUMN_BREAKPOINTS,
  ListTable,
  listTableCss,
  REGION_FOCUS_RING,
  type ListTableColumn,
} from "./list-table.js"
import { Td } from "./table.js"

afterEach(cleanup)

const COLUMNS: ListTableColumn[] = [
  { label: "Activity" },
  { label: "Process", hideBelow: "sm" },
  { label: "Created", align: "right", hideBelow: "md" },
  { plain: true, sticky: true },
]

function Jobs() {
  return (
    <ListTable ariaLabel="Failed jobs" columns={COLUMNS}>
      <tr>
        <Td>Send invoice</Td>
        <Td>invoice</Td>
        <Td align="right">10:00</Td>
        <Td align="right">
          <button type="button">Retry</button>
        </Td>
      </tr>
    </ListTable>
  )
}

describe("ListTable: the table never widens the document (U2, WCAG 1.4.10)", () => {
  it("scrolls inside a named region a keyboard can reach", () => {
    render(<Jobs />)
    const region = screen.getByRole("region", { name: "Failed jobs" })
    expect(region.getAttribute("tabindex")).toBe("0")
    expect(region.className).toContain("overflow-x-auto")
    // A container: the column priorities read the REGION's width.
    expect(region.className).toContain("@container")
    expect(region.className).toContain("min-w-0")
    expect(region.contains(screen.getByRole("table", { name: "Failed jobs" }))).toBe(true)
  })

  it("draws its focus ring inside its own box, where no clipping wrapper can cut it", () => {
    render(<Jobs />)
    const region = screen.getByRole("region")
    const regionClasses = region.className.split(/\s+/)
    // The region is the peer and draws no ring of its own: the toolkit's
    // outset ring is cut away by the `overflow-hidden` cards it fills edge
    // to edge (shell:data-table, history), and the pinned column covers an
    // outline of the region itself.
    expect(regionClasses).toContain("peer")
    expect(regionClasses.some((c) => c.includes("ring"))).toBe(false)
    // The ring: the region's next sibling, over its box, inside its edge,
    // above the pinned column, never in the accessibility tree or a click's way.
    const ring = region.nextElementSibling as HTMLElement
    expect(ring.hasAttribute("data-list-table-ring")).toBe(true)
    expect(ring.getAttribute("aria-hidden")).toBe("true")
    const ringClasses = ring.className.split(/\s+/)
    for (const name of REGION_FOCUS_RING.split(" ")) expect(ringClasses).toContain(name)
    expect(ringClasses).toEqual(
      expect.arrayContaining([
        "peer-focus-visible:-outline-offset-2",
        "absolute",
        "inset-0",
        "z-[2]",
        "pointer-events-none",
      ]),
    )
    // Its frame does not scroll, so the ring stays put while the table does.
    expect(region.parentElement!.className.split(/\s+/)).toContain("relative")
    expect(region.parentElement!.className).not.toContain("overflow")
  })

  it("sets the rows in the dense table step, the heads in the 13 px caption", () => {
    render(<Jobs />)
    expect(screen.getByRole("table").className).toContain("text-dense")
    const head = screen.getByRole("columnheader", { name: "Activity" })
    expect(head.className).toContain("text-small")
    expect(head.className).toContain("font-semibold")
    expect(screen.getByRole("cell", { name: "Send invoice" }).className).toContain("text-dense")
  })

  it("hides low-priority columns and pins the actions through rules scoped to this table", () => {
    const { container } = render(<Jobs />)
    const region = screen.getByRole("region")
    const scope = region.getAttribute("data-list-table")!
    const css = container.querySelector("style")?.textContent ?? ""
    expect(css).toBe(listTableCss(scope, COLUMNS))
    const at = `[data-list-table="${scope}"]`
    expect(css).toContain(`${at} tr > :nth-child(2) { display: none; }`)
    expect(css).toContain(
      `@container (min-width: ${COLUMN_BREAKPOINTS.sm}) { ${at} tr > :nth-child(2) { display: table-cell; } }`,
    )
    expect(css).toContain(`@container (min-width: 48rem) { ${at} tr > :nth-child(3)`)
    // The pinned cell paints its row's background, so a hovered, selected or
    // dimmed row covers it too; the rows' default surface has no specificity,
    // so a row's own class wins.
    expect(css).toContain(
      `${at} tr > :nth-child(4) { position: sticky; right: 0; z-index: 1; background-color: inherit; }`,
    )
    expect(css).toContain(
      `:where(${at} tbody tr) { background-color: var(--list-table-surface, var(--card)); }`,
    )
    expect(css).toContain(`:where(${at} thead tr) { background-color: var(--muted); }`)
  })

  it("scopes each table on its own", () => {
    render(
      <>
        <Jobs />
        <Jobs />
      </>,
    )
    const [a, b] = screen.getAllByRole("region")
    expect(a.getAttribute("data-list-table")).not.toBe(b.getAttribute("data-list-table"))
  })

  it("renders no stylesheet for a table without priorities or pinned actions", () => {
    const { container } = render(
      <ListTable ariaLabel="Plain" columns={[{ label: "A" }, { label: "B" }]}>
        <tr>
          <Td>a</Td>
          <Td>b</Td>
        </tr>
      </ListTable>,
    )
    expect(container.querySelector("style")).toBeNull()
  })
})

describe("listTableCss", () => {
  it("pins only the LAST column, the row actions", () => {
    const css = listTableCss("s", [{ label: "A", sticky: true }, { label: "B" }])
    expect(css).toBe("")
  })

  it("maps each breakpoint to its container width", () => {
    for (const [name, width] of Object.entries(COLUMN_BREAKPOINTS)) {
      const css = listTableCss("s", [
        { label: "A", hideBelow: name as keyof typeof COLUMN_BREAKPOINTS },
      ])
      expect(css).toContain(`@container (min-width: ${width})`)
    }
    expect(COLUMN_BREAKPOINTS).toEqual({ sm: "40rem", md: "48rem", lg: "64rem" })
  })
})
