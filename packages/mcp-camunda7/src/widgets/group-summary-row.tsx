import type { ReactNode } from "react"
import { CountPill, TONE_DOT, cn, type ToneVariant } from "@miragon-ai/widget-shell/widgets"

/** One right-aligned value-over-label stack in a {@link GroupSummaryRow}. */
export interface GroupSummaryStat {
  value: ReactNode
  label: ReactNode
}

/**
 * The soft-tinted "!" tile that leads incident activity rows — shared so the
 * grouped incident lists (dashboard + definition view) stay pixel-identical.
 */
export function IncidentGroupIcon({ tone = "critical" }: { tone?: ToneVariant }) {
  return (
    <div
      className={cn(
        "grid size-6 place-items-center rounded-md text-xs font-bold",
        tone === "critical" ? "bg-critical-soft text-critical" : "bg-muted text-muted-foreground",
      )}
    >
      !
    </div>
  )
}

/**
 * Shared summary-row anatomy for expandable group cards and their inner rows:
 * optional leading icon, tone dot + name with a mono subline, right-aligned
 * stat stacks, a count pill, action cells, and the rotating chevron. Extracted
 * from the previously copy-pasted trio incidents-dashboard/process-list
 * (ProcessSummary + ActivityRow) and process-incidents/activity-summary.
 *
 * `expanded` doubles as the expandability switch: pass a boolean to get the
 * chevron (and the bottom border while open); omit it for plain list rows.
 */
export function GroupSummaryRow({
  icon,
  tone,
  title,
  titleSuffix,
  subline,
  stats = [],
  count,
  countTone = "critical",
  actions,
  expanded,
  className,
}: {
  /** Leading icon cell, e.g. {@link IncidentGroupIcon}. */
  icon?: ReactNode
  /** Tone dot rendered before the title (severity of the group). */
  tone?: ToneVariant
  title: ReactNode
  /** Inline suffix after the title, e.g. a `VersionChip`. */
  titleSuffix?: ReactNode
  /** Mono, truncated second line under the title. */
  subline?: ReactNode
  stats?: GroupSummaryStat[]
  /** Count-pill content after the stats; omit to render no pill. */
  count?: ReactNode
  countTone?: ToneVariant
  /** Action cells (AskAi / drill / cockpit link) between the pill and the chevron. */
  actions?: ReactNode
  expanded?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-3",
        expanded && "border-border border-b",
        className,
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
          {tone && <span className={`size-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} />}
          <span className="truncate">{title}</span>
          {titleSuffix}
        </div>
        {subline !== undefined && (
          <div className="text-muted-foreground truncate font-mono text-xs">{subline}</div>
        )}
      </div>
      {stats.map((stat, i) => (
        <div key={i} className="text-muted-foreground min-w-[80px] text-right text-xs tabular-nums">
          <div className="text-foreground font-semibold">{stat.value}</div>
          <div>{stat.label}</div>
        </div>
      ))}
      {count !== undefined && <CountPill tone={countTone}>{count}</CountPill>}
      {actions}
      {expanded !== undefined && (
        <span
          aria-hidden="true"
          className={`text-muted-foreground inline-block w-3 text-center text-xs transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
      )}
    </div>
  )
}
