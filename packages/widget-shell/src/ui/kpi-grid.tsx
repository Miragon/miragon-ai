import type { ReactNode } from "react"
import type { ToneVariant } from "./widget-header.js"

const TONE_VALUE: Partial<Record<ToneVariant, string>> = {
  critical: "text-critical",
  warning: "text-warning",
  success: "text-m-green",
}

const TREND_TONE: Record<"up" | "down" | "flat", string> = {
  up: "text-critical",
  down: "text-m-green",
  flat: "text-ink-muted",
}

export interface KpiCell {
  label: ReactNode
  value: ReactNode
  /** Small fraction shown next to the value, e.g. " /14" */
  fraction?: ReactNode
  trend?: ReactNode
  trendDirection?: "up" | "down" | "flat"
  tone?: ToneVariant
}

/**
 * Bordered KPI strip — typically 4 cells across. Matches the `.kpis` block
 * in the Miragon mockup. Cells flow as columns; cell count adapts via
 * `grid-cols-N` (supports 1–6). For denser compact stats use `MiniStats`.
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
  const wrapperClass = boxed ? "border-line overflow-hidden rounded-lg border" : ""
  const stripClass = boxed ? "" : "border-line border-y"
  return (
    <div className={wrapperClass}>
      {header && (
        <div className="border-line bg-bg text-ink-subtle flex items-center gap-2 border-b px-4 py-2 text-[11px] font-semibold uppercase tracking-wide">
          <span>{header.label}</span>
          {header.badge && (
            <span className="border-line bg-card text-ink-subtle rounded border px-1.5 py-0 text-[10px] font-medium normal-case">
              {header.badge}
            </span>
          )}
        </div>
      )}
      <div className={`grid ${colClass} ${stripClass}`}>
        {cells.map((cell, idx) => (
          <div
            key={idx}
            className={`px-5 py-4 ${idx < cells.length - 1 ? "border-line border-r" : ""}`}
          >
            <div className="text-ink-subtle text-xs font-medium">{cell.label}</div>
            <div
              className={`mt-1.5 text-2xl font-bold tabular-nums leading-none tracking-tight ${
                cell.tone ? TONE_VALUE[cell.tone] : "text-ink"
              }`}
            >
              {cell.value}
              {cell.fraction && (
                <span className="text-ink-subtle ml-0.5 text-sm font-normal">{cell.fraction}</span>
              )}
            </div>
            {cell.trend && (
              <div
                className={`mt-1.5 text-xs ${
                  cell.trendDirection ? TREND_TONE[cell.trendDirection] : "text-ink-muted"
                }`}
              >
                {cell.trend}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
