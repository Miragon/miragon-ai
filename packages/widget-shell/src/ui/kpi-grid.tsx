import type { ReactNode } from "react"
import { Skeleton } from "@miragon/mcp-toolkit-ui"
import { cn } from "./cn.js"
import { MICRO_LABEL, TONE_SOFT, TONE_TEXT, type ToneVariant } from "./tone-utils.js"

/** Direction-derived fallback (incident-biased: up = red); `trendTone` wins. */
const TREND_TONE: Record<"up" | "down" | "flat", string> = {
  up: "text-critical",
  down: "text-m-green",
  flat: "text-muted-foreground",
}

interface KpiCellBase {
  label: ReactNode
  value: ReactNode
  /** Small fraction shown next to the value, e.g. " /14" */
  fraction?: ReactNode
  trend?: ReactNode
  trendDirection?: "up" | "down" | "flat"
  /** Explicit trend color — overrides the direction-derived fallback. */
  trendTone?: ToneVariant
  tone?: ToneVariant
}

/**
 * `onClick` renders the cell as a button — turns a metric into a nav entry
 * point (e.g. "Incidents" → open the incidents dashboard). A clickable cell
 * requires an `ariaLabel`, since the visible label/value may be terse.
 */
export type KpiCell = KpiCellBase &
  ({ onClick: () => void; ariaLabel: string } | { onClick?: never; ariaLabel?: never })

/**
 * Bordered KPI strip — typically 4 cells across. Matches the `.kpis` block
 * in the Miragon mockup. Cells flow as columns; cell count adapts via
 * `grid-cols-N` (1–6; more than 6 cells wrap onto further rows).
 *
 * Responsive: 4+ cells fall back to 2 columns on narrow hosts (claude.ai inline
 * / mobile iframes are frequently <500px, where five cells side-by-side leave
 * ~40px of content each). Dividers come from a `gap-px` grid on a `bg-border`
 * background (cells are `bg-card`), so they stay correct at any wrap — a
 * per-cell border count tied to a fixed column would be wrong once it reflows.
 */
const COL_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
}

export interface KpiGridHeader {
  /** Group label, e.g. "Health". Renders uppercase in the strip header. */
  label: ReactNode
  /** Optional muted badge to the right of the label, e.g. "Status der …". */
  badge?: ReactNode
}

/** Label + value + fraction + trend — shared by the strip and soft variants. */
function KpiCellBody({ cell, variant }: { cell: KpiCell; variant: "strip" | "soft" }) {
  const trendClass = cell.trendTone
    ? (TONE_TEXT[cell.trendTone] ?? "text-muted-foreground")
    : cell.trendDirection
      ? TREND_TONE[cell.trendDirection]
      : "text-muted-foreground"
  return (
    <>
      <div
        className={
          variant === "soft"
            ? "flex items-center justify-between gap-2 text-sm font-medium"
            : "text-muted-foreground flex items-center justify-between gap-2 text-xs font-medium"
        }
      >
        <span>{cell.label}</span>
        {cell.onClick && (
          <span aria-hidden="true" className="text-sm leading-none">
            ›
          </span>
        )}
      </div>
      <div
        className={
          variant === "soft"
            ? "mt-1 text-2xl font-bold tabular-nums"
            : cn(
                "mt-1.5 text-2xl font-bold tabular-nums leading-none tracking-tight",
                (cell.tone && TONE_TEXT[cell.tone]) || "text-foreground",
              )
        }
      >
        {cell.value}
        {cell.fraction && (
          <span
            className={cn(
              "ml-0.5 text-sm font-normal",
              variant === "strip" && "text-muted-foreground",
            )}
          >
            {cell.fraction}
          </span>
        )}
      </div>
      {cell.trend && <div className={cn("mt-1.5 text-xs", trendClass)}>{cell.trend}</div>}
    </>
  )
}

/**
 * When `boxed`, the strip is wrapped in a rounded bordered card and an
 * optional `header` row carries a group label (matches the `.kpi-block`
 * pattern in the cockpit-overview mockup). When unboxed (default), the
 * strip uses the lighter `border-y` look used by the incidents dashboard.
 *
 * `variant="soft"` renders each cell as a tone-tinted card (TONE_SOFT
 * background + foreground) in a gap grid instead of the bordered strip —
 * the failure-dashboard summary look. `boxed`/`header` don't apply there.
 */
export function KpiGrid({
  cells,
  boxed = false,
  header,
  variant = "strip",
  ariaLabel,
  className,
}: {
  cells: KpiCell[]
  boxed?: boolean
  header?: KpiGridHeader
  variant?: "strip" | "soft"
  ariaLabel?: string
  className?: string
}) {
  const cols = Math.min(Math.max(cells.length, 1), 6)
  const colClass = COL_CLASS[cols]
  if (variant === "soft") {
    return (
      <div
        role={ariaLabel ? "group" : undefined}
        aria-label={ariaLabel}
        className={cn("grid gap-4", colClass, className)}
      >
        {cells.map((cell, idx) => {
          const toneClass = cell.tone ? TONE_SOFT[cell.tone] : "bg-muted text-muted-foreground"
          const body = <KpiCellBody cell={cell} variant="soft" />
          return cell.onClick ? (
            <button
              key={idx}
              type="button"
              onClick={cell.onClick}
              aria-label={cell.ariaLabel}
              className={cn(
                "focus-visible:ring-ring cursor-pointer rounded-xl p-4 text-left outline-none transition-colors focus-visible:ring-2",
                toneClass,
              )}
            >
              {body}
            </button>
          ) : (
            <div key={idx} className={cn("rounded-xl p-4", toneClass)}>
              {body}
            </div>
          )
        })}
      </div>
    )
  }
  return (
    <div
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
      className={cn(boxed && "border-border overflow-hidden rounded-lg border", className)}
    >
      {header && (
        <div
          className={cn(
            "border-border bg-muted text-muted-foreground flex items-center gap-2 border-b px-4 py-2",
            MICRO_LABEL,
          )}
        >
          <span>{header.label}</span>
          {header.badge && (
            <span className="border-border bg-card text-muted-foreground rounded border px-1.5 py-0 text-[10px] font-medium normal-case">
              {header.badge}
            </span>
          )}
        </div>
      )}
      {/* gap-px on bg-border draws the dividers; cells are bg-card. This is
          wrap-safe (every reflowed gap gets a divider) unlike per-cell borders
          tied to a fixed column count. */}
      <div className={cn("bg-border grid gap-px", colClass, !boxed && "border-border border-y")}>
        {cells.map((cell, idx) => {
          const body = <KpiCellBody cell={cell} variant="strip" />
          return cell.onClick ? (
            <button
              key={idx}
              type="button"
              onClick={cell.onClick}
              aria-label={cell.ariaLabel}
              className="bg-card hover:bg-muted focus-visible:ring-ring cursor-pointer px-5 py-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset"
            >
              {body}
            </button>
          ) : (
            <div key={idx} className="bg-card px-5 py-4">
              {body}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Loading placeholder mirroring {@link KpiGrid}'s geometry — same wrapper,
 * grid and cell padding for both variants, so the layout doesn't jump when
 * the data arrives.
 */
export function KpiGridSkeleton({
  cells,
  variant = "strip",
  boxed = false,
}: {
  cells: number
  variant?: "strip" | "soft"
  boxed?: boolean
}) {
  const cols = Math.min(Math.max(cells, 1), 6)
  const colClass = COL_CLASS[cols]
  if (variant === "soft") {
    return (
      <div aria-busy="true" className={cn("grid gap-4", colClass)}>
        {Array.from({ length: cells }, (_, idx) => (
          <div key={idx} className="bg-muted rounded-xl p-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-2 h-7 w-14" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div
      aria-busy="true"
      className={cn(boxed && "border-border overflow-hidden rounded-lg border")}
    >
      <div className={cn("bg-border grid gap-px", colClass, !boxed && "border-border border-y")}>
        {Array.from({ length: cells }, (_, idx) => (
          <div key={idx} className="bg-card px-5 py-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2.5 h-7 w-14" />
          </div>
        ))}
      </div>
    </div>
  )
}
