import { useId, type ReactNode } from "react"
import { cn } from "@miragon/mcp-toolkit-ui"
import { Th } from "./table.js"

/**
 * The scroll region's focus ring, drawn INSIDE its box: the region usually
 * fills a card or a bordered wrapper edge to edge, often one that clips its
 * overflow, so the toolkit's outset `FOCUS_RING` (a box-shadow 2 px off the
 * element) is cut away there and keyboard focus turns invisible (WCAG
 * 2.4.7). Neither the region's own inset shadow (`FOCUS_RING_INSET`) nor its
 * own outline would do: the header and row fills paint over the one, and the
 * pinned action column (a positioned cell) over both. So the ring is a
 * sibling laid over the region's box, above the pinned column, that shows
 * while the region (the `peer`) has keyboard focus: same `--focus` role and
 * 2 px as the kit's ring, an outline pulled inward, which stays visible in
 * forced-colours mode.
 */
export const REGION_FOCUS_RING =
  "peer-focus-visible:outline-2 peer-focus-visible:outline-solid peer-focus-visible:outline-focus peer-focus-visible:-outline-offset-2"

/** Above the pinned column's `z-index: 1` (see {@link listTableCss}). */
const RING_LAYER = "pointer-events-none absolute inset-0 z-[2] rounded-sm"

/**
 * Container widths below which a `hideBelow` column is hidden — the region's
 * OWN width (a container query), so a table in a narrow split column hides
 * like one in a narrow host. `sm` 40rem (640 px), `md` 48rem (768 px: hidden
 * in a 760 px inline view, shown in fullscreen), `lg` 64rem (1024 px).
 */
export const COLUMN_BREAKPOINTS = { sm: "40rem", md: "48rem", lg: "64rem" } as const

export type ColumnBreakpoint = keyof typeof COLUMN_BREAKPOINTS

export interface ListTableColumn {
  /** Header label; omit together with `plain` for an empty actions column. */
  label?: ReactNode
  align?: "left" | "right"
  /** Bare header cell without the MICRO_LABEL treatment (actions column). */
  plain?: boolean
  /** Merged into the Th (e.g. a compact `py-2`). */
  className?: string
  /**
   * Column priority: hidden (header AND every row's cell in this position)
   * while the table's region is narrower than the breakpoint. Give it to the
   * columns a reader can do without; the identifying column and the row
   * actions never hide.
   */
  hideBelow?: ColumnBreakpoint
  /**
   * The row actions: the LAST column only. It stays pinned to the region's
   * right edge while the table scrolls sideways, so Retry or Open is never
   * scrolled out of reach. Ignored on any other column. Rows then paint the
   * card surface; a table on another surface sets `--list-table-surface`
   * (e.g. `[--list-table-surface:var(--muted)]` on its wrapper).
   */
  sticky?: boolean
}

/**
 * The scoped rules of one table: hidden columns per container width and the
 * pinned action column. Rows are hand-composed, so the rules address cell
 * POSITIONS (`tr > :nth-child(n)`) — one cell per column, as every list
 * renders them — and a row cannot drift from its header.
 */
export function listTableCss(scope: string, columns: ReadonlyArray<ListTableColumn>): string {
  const at = `[data-list-table="${scope}"]`
  const rules: string[] = []
  columns.forEach((column, index) => {
    const cell = `${at} tr > :nth-child(${index + 1})`
    if (column.hideBelow) {
      const width = COLUMN_BREAKPOINTS[column.hideBelow]
      rules.push(
        `${cell} { display: none; }`,
        `@container (min-width: ${width}) { ${cell} { display: table-cell; } }`,
      )
    }
    if (column.sticky && index === columns.length - 1) {
      // The pinned cell paints its ROW's background (`inherit`), so a row's
      // hover, selection or dimming covers it too. Rows get the surface as a
      // default of zero specificity (`:where`): a row's own class wins, and
      // a table on another surface sets `--list-table-surface`.
      rules.push(
        `:where(${at} tbody tr) { background-color: var(--list-table-surface, var(--card)); }`,
        `:where(${at} thead tr) { background-color: var(--muted); }`,
        `${cell} { position: sticky; right: 0; z-index: 1; background-color: inherit; }`,
      )
    }
  })
  return rules.join("\n")
}

/**
 * The cockpit table FRAME — the scroll region, the `<table>`/`<thead>` and
 * the `Th` header row every list used to hand-copy. Rows stay hand-composed
 * `<tr>` + `Td` per widget, because the cells are where lists legitimately
 * differ (badges, inline mutations, AI hand-offs). Pair with
 * {@link TableEmptyState} instead of rendering an empty frame.
 *
 * The table never widens the document: it scrolls sideways inside a named,
 * keyboard-reachable region (`role="region"`, `tabIndex=0`, WCAG 1.4.10 and
 * 2.1.1), its row actions can stay pinned at the right edge (`sticky` on the
 * last column), and columns a reader can do without hide in a narrow region
 * (`hideBelow`). Dense table text: 14 px (`text-dense`, the product exception
 * of the type scale), heads 13 px semibold.
 */
export function ListTable({
  columns,
  ariaLabel,
  className,
  children,
}: {
  columns: ReadonlyArray<ListTableColumn>
  /** Names the table and its scroll region ("Failed jobs"). */
  ariaLabel: string
  /** Merged into the `<table>` (e.g. the compact `[&_th]:border-t-0`). */
  className?: string
  /** The `<tr>` rows. */
  children: ReactNode
}) {
  const scope = useId()
  const css = listTableCss(scope, columns)
  return (
    // The frame does not scroll, so the ring laid over the region stays put
    // while the table scrolls under it.
    <div className="relative w-full min-w-0">
      <div
        role="region"
        aria-label={ariaLabel}
        // A scrollable region must be reachable by keyboard to scroll it.
        tabIndex={0}
        data-list-table={scope}
        className="peer @container w-full min-w-0 overflow-x-auto rounded-sm focus-visible:outline-hidden"
      >
        {css && <style>{css}</style>}
        <table
          className={cn("text-dense w-full border-collapse", className)}
          aria-label={ariaLabel}
        >
          <thead className="bg-muted">
            <tr>
              {columns.map((column, index) => (
                <Th
                  key={index}
                  align={column.align}
                  plain={column.plain}
                  className={column.className}
                >
                  {column.label}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      <span
        aria-hidden="true"
        data-list-table-ring=""
        className={cn(RING_LAYER, REGION_FOCUS_RING)}
      />
    </div>
  )
}
