import type { ReactNode } from "react"
import type { ToneVariant } from "./widget-header.js"

const TONE: Partial<Record<ToneVariant, string>> = {
  critical: "text-critical",
  warning: "text-warning",
  success: "text-m-green",
}

export interface MiniStat {
  label: ReactNode
  value: ReactNode
  tone?: ToneVariant
  /** Render the value in a smaller monospace style (e.g. timestamps). */
  mono?: boolean
}

/**
 * Inline stats bar — used for compact summaries inside detail views. Matches
 * the `.mini-stats` block in the Miragon mockup.
 */
export function MiniStats({ stats }: { stats: MiniStat[] }) {
  return (
    <div className="bg-bg border-line flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border px-5 py-3.5">
      {stats.map((stat, idx) => (
        <div key={idx} className="flex flex-col">
          <span className="text-ink-subtle text-xs font-medium">{stat.label}</span>
          <span
            className={`font-bold tabular-nums leading-tight tracking-tight ${
              stat.mono ? "font-mono text-sm" : "text-lg"
            } ${stat.tone ? TONE[stat.tone] : "text-ink"}`}
          >
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  )
}
