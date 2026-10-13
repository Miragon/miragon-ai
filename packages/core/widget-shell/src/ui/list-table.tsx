import { Children, useId, type ReactNode } from "react"
import { Button, cn, MICRO_LABEL, useLocale } from "@miragon/mcp-toolkit-ui"
import { Maximize2 } from "lucide-react"
import { formatNumber } from "./format.js"
import { Icon } from "./icon.js"
import { useInlineBudget, useRowsBudgeted } from "./inline-budget.js"
import { useInlineRows } from "./inline-fit.js"
import { kitLabels } from "./kit-labels.js"
import { Th, type ColumnSort } from "./table.js"

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
  /** The rows are sorted by this column: `aria-sort` and a direction arrow on its head. */
  sort?: ColumnSort
}

/**
 * A head over adjacent columns, in a row above the column heads: what the
 * columns under it have in common ("Job backlog, comparable across
 * engines"). The groups cover the columns left to right, each `span` columns
 * (default 1); a group without `label` is an empty cell over a column that
 * belongs to none. A column under a group of several never hides (the span
 * would not shrink with it): give `hideBelow` only to a column in a group of
 * its own.
 */
export interface ListTableGroup {
  label?: ReactNode
  span?: number
}

/** Where each group sits: its position in the group row and the columns it covers. */
function groupLayout(
  columns: ReadonlyArray<ListTableColumn>,
  groups: ReadonlyArray<ListTableGroup>,
): Array<{ position: number; first: number; span: number }> {
  let first = 0
  const layout = groups.map((group, index) => {
    const span = group.span ?? 1
    if (!Number.isInteger(span) || span < 1) {
      throw new Error(`ListTable: group ${index + 1} spans ${span} columns; a span is 1 or more`)
    }
    const entry = { position: index + 1, first, span }
    first += span
    return entry
  })
  if (first !== columns.length) {
    throw new Error(
      `ListTable: the groups cover ${first} columns, the table has ${columns.length}; cover each column once`,
    )
  }
  for (const { first: start, span } of layout) {
    if (span === 1) continue
    const hidden = columns.slice(start, start + span).findIndex((c) => c.hideBelow)
    if (hidden >= 0) {
      throw new Error(
        `ListTable: column ${start + hidden + 1} hides, but sits under a group of ${span}; a column under a group of several never hides`,
      )
    }
  }
  return layout
}

/** `display: none` below the breakpoint, a table cell from it on. */
function hideRules(cell: string, below: ColumnBreakpoint): string[] {
  const width = COLUMN_BREAKPOINTS[below]
  return [
    `${cell} { display: none; }`,
    `@container (min-width: ${width}) { ${cell} { display: table-cell; } }`,
  ]
}

/**
 * The scoped rules of one table: hidden columns per container width and the
 * pinned action column. Rows are hand-composed, so the rules address cell
 * POSITIONS (`tr > :nth-child(n)`) — one cell per column, as every list
 * renders them — and a row cannot drift from its header. The group row (if
 * any) is addressed by its own positions: a group of one follows its column.
 */
export function listTableCss(
  scope: string,
  columns: ReadonlyArray<ListTableColumn>,
  groups?: ReadonlyArray<ListTableGroup>,
): string {
  const at = `[data-list-table="${scope}"]`
  const rows = groups ? `${at} tr:not([data-list-table-groups])` : `${at} tr`
  const groupRow = `${at} tr[data-list-table-groups]`
  const layout = groups ? groupLayout(columns, groups) : []
  /** The group-row cell over column `index` when it heads that column alone. */
  const ownGroupCell = (index: number) => {
    const group = layout.find((g) => g.first === index && g.span === 1)
    return group ? `${groupRow} > :nth-child(${group.position})` : undefined
  }
  const rules: string[] = []
  columns.forEach((column, index) => {
    const cells = [`${rows} > :nth-child(${index + 1})`, ownGroupCell(index)].filter(
      (cell): cell is string => cell !== undefined,
    )
    if (column.hideBelow) {
      for (const cell of cells) rules.push(...hideRules(cell, column.hideBelow))
    }
    if (column.sticky && index === columns.length - 1) {
      if (groups && !ownGroupCell(index)) {
        throw new Error("ListTable: the pinned last column needs a group of its own")
      }
      // The pinned cell paints its ROW's background (`inherit`), so a row's
      // hover, selection or dimming covers it too. Rows get the surface as a
      // default of zero specificity (`:where`): a row's own class wins, and
      // a table on another surface sets `--list-table-surface`.
      rules.push(
        `:where(${at} tbody tr) { background-color: var(--list-table-surface, var(--card)); }`,
        `:where(${at} thead tr) { background-color: var(--muted); }`,
        ...cells.map(
          (cell) =>
            `${cell} { position: sticky; right: 0; z-index: 1; background-color: inherit; }`,
        ),
      )
    }
  })
  return rules.join("\n")
}

/**
 * The group row: a head per group, an empty cell over a column in none. A
 * head is a column header (`scope="col"`) spanning its columns: the HTML
 * table model assigns it to every cell below the columns it spans.
 * `scope="colgroup"` would need a `<colgroup>` element to anchor it, and the
 * table has none (a `<col>` element also keeps a hidden column in the table
 * model).
 */
function GroupRow({ groups }: { groups: ReadonlyArray<ListTableGroup> }) {
  return (
    <tr data-list-table-groups="">
      {groups.map((group, index) =>
        group.label === undefined ? (
          <td key={index} colSpan={group.span ?? 1} className="border-border border-t" />
        ) : (
          <th
            key={index}
            scope="col"
            colSpan={group.span ?? 1}
            className={cn(
              "border-border text-foreground border-t border-l px-4 pt-2.5 pb-1 text-center",
              MICRO_LABEL,
            )}
          >
            {group.label}
          </th>
        ),
      )}
    </tr>
  )
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
 *
 * Inline in a chat (#396) it shows the head of its rows, as many as fit the
 * view's height budget (`useInlineRows`, measured on the rendered view), and
 * a last row says how many there are and offers the rest: fullscreen where
 * the host offers it, else the next rows in place. A paged list fits its rows
 * as one list (`PagedRows`): a table inside one is never capped twice, it
 * hands its body to the paged list's fit instead.
 */
export function ListTable({
  columns,
  groups,
  ariaLabel,
  className,
  children,
}: {
  columns: ReadonlyArray<ListTableColumn>
  /** Heads over adjacent columns, in a row above the column heads ({@link ListTableGroup}). */
  groups?: ReadonlyArray<ListTableGroup>
  /** Names the table and its scroll region ("Failed jobs"). */
  ariaLabel: string
  /** Merged into the `<table>` (e.g. the compact `[&_th]:border-t-0`). */
  className?: string
  /** The `<tr>` rows. */
  children: ReactNode
}) {
  const scope = useId()
  const css = listTableCss(scope, columns, groups)
  const budget = useInlineBudget()
  const paged = useRowsBudgeted()
  const rows = Children.toArray(children)
  const own = useInlineRows(rows.length, { enabled: paged === null })
  const cap = paged ? null : own.cap
  const capped = cap !== null && rows.length > cap
  const showMore = budget.expand ?? (() => own.reveal(own.step))
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
            {groups && <GroupRow groups={groups} />}
            <tr>
              {columns.map((column, index) => (
                <Th
                  key={index}
                  align={column.align}
                  plain={column.plain}
                  sort={column.sort}
                  className={column.className}
                >
                  {column.label}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody ref={paged ? paged.attachRows : own.attachRows}>
            {/* The same keyed rows either way: a cap that comes or goes (a new
                budget, a wider column) never remounts the rows. */}
            {capped ? rows.slice(0, cap) : rows}
          </tbody>
          {capped && (
            <MoreRows
              colSpan={columns.length}
              shown={cap}
              total={rows.length}
              fullscreen={budget.expand !== null}
              onShowMore={showMore}
            />
          )}
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

/**
 * The last row of an inline table with more rows than its budget: how many
 * it shows, and the way to the rest. A footer of its own (`<tfoot>`), so the
 * position rules of the body rows never address it; its one cell spans every
 * column and always shows (`display` set on the cell beats a hidden column's
 * rule).
 */
function MoreRows({
  colSpan,
  shown,
  total,
  fullscreen,
  onShowMore,
}: {
  colSpan: number
  shown: number
  total: number
  fullscreen: boolean
  onShowMore: () => void
}) {
  const labels = kitLabels(useLocale())
  return (
    <tfoot>
      <tr data-list-table-more="">
        <td
          colSpan={colSpan}
          style={{ display: "table-cell" }}
          className="border-border border-t px-4 py-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-small" aria-live="polite">
              {labels.rowsShown({ shown: formatNumber(shown), total: formatNumber(total) })}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={onShowMore}>
              {fullscreen && <Icon icon={Maximize2} dense />}
              {fullscreen ? labels.showAll : labels.showMore}
            </Button>
          </div>
        </td>
      </tr>
    </tfoot>
  )
}
