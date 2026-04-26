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

export function KpiGrid({ cells }: { cells: KpiCell[] }) {
  const cols = Math.min(Math.max(cells.length, 1), 6)
  const colClass = COL_CLASS[cols] ?? "grid-cols-4"
  return (
    <div className={`border-line grid ${colClass} border-y`}>
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
  )
}
