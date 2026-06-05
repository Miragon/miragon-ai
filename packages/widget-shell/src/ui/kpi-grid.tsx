import type { ReactNode } from "react"
import { TONE_TEXT, type ToneVariant } from "./tone-utils.js"

const TREND_TONE: Record<"up" | "down" | "flat", string> = {
  up: "text-critical",
  down: "text-m-green",
  flat: "text-muted-foreground",
}

export interface KpiCell {
  label: ReactNode
  value: ReactNode
  /** Small fraction shown next to the value, e.g. " /14" */
  fraction?: ReactNode
  trend?: ReactNode
  trendDirection?: "up" | "down" | "flat"
  tone?: ToneVariant
  /** When set, the cell renders as a button — turns a metric into a nav entry
   *  point (e.g. "Incidents" → open the incidents dashboard). */
  onClick?: () => void
  /** Accessible label for the clickable cell (required for good a11y when
   *  `onClick` is set, since the visible label/value may be terse). */
  ariaLabel?: string
}

/**
 * Bordered KPI strip — typically 4 cells across. Matches the `.kpis` block
 * in the Miragon mockup. Cells flow as columns; cell count adapts via
 * `grid-cols-N` (supports 1–6).
 */
const COL_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
}

export interface KpiGridHeader {
  /** Group label, e.g. "Health". Renders uppercase in the strip header. */
  label: ReactNode
  /** Optional muted badge to the right of the label, e.g. "Status der …". */
  badge?: ReactNode
}

/**
 * When `boxed`, the strip is wrapped in a rounded bordered card and an
 * optional `header` row carries a group label (matches the `.kpi-block`
 * pattern in the cockpit-overview mockup). When unboxed (default), the
 * strip uses the lighter `border-y` look used by the incidents dashboard.
 */
export function KpiGrid({
  cells,
  boxed = false,
  header,
}: {
  cells: KpiCell[]
  boxed?: boolean
  header?: KpiGridHeader
}) {
  const cols = Math.min(Math.max(cells.length, 1), 6)
  const colClass = COL_CLASS[cols] ?? "grid-cols-4"
  const wrapperClass = boxed ? "border-border overflow-hidden rounded-lg border" : ""
  const stripClass = boxed ? "" : "border-border border-y"
  return (
    <div className={wrapperClass}>
      {header && (
        <div className="border-border bg-muted text-muted-foreground flex items-center gap-2 border-b px-4 py-2 text-[11px] font-semibold uppercase tracking-wide">
          <span>{header.label}</span>
          {header.badge && (
            <span className="border-border bg-card text-muted-foreground rounded border px-1.5 py-0 text-[10px] font-medium normal-case">
              {header.badge}
            </span>
          )}
        </div>
      )}
      <div className={`grid ${colClass} ${stripClass}`}>
        {cells.map((cell, idx) => {
          const borderClass = idx < cells.length - 1 ? "border-border border-r" : ""
          const content = (
            <>
              <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs font-medium">
                <span>{cell.label}</span>
                {cell.onClick && (
                  <span aria-hidden="true" className="text-sm leading-none">
                    ›
                  </span>
                )}
              </div>
              <div
                className={`mt-1.5 text-2xl font-bold tabular-nums leading-none tracking-tight ${
                  (cell.tone && TONE_TEXT[cell.tone]) || "text-foreground"
                }`}
              >
                {cell.value}
                {cell.fraction && (
                  <span className="text-muted-foreground ml-0.5 text-sm font-normal">
                    {cell.fraction}
                  </span>
                )}
              </div>
              {cell.trend && (
                <div
                  className={`mt-1.5 text-xs ${
                    cell.trendDirection ? TREND_TONE[cell.trendDirection] : "text-muted-foreground"
                  }`}
                >
                  {cell.trend}
                </div>
              )}
            </>
          )
          return cell.onClick ? (
            <button
              key={idx}
              type="button"
              onClick={cell.onClick}
              aria-label={cell.ariaLabel}
              className={`hover:bg-muted focus-visible:ring-ring cursor-pointer px-5 py-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset ${borderClass}`}
            >
              {content}
            </button>
          ) : (
            <div key={idx} className={`px-5 py-4 ${borderClass}`}>
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
