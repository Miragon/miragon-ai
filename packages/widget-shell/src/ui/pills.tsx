import type { ReactNode } from "react"
import type { ToneVariant } from "./widget-header.js"

const TONE: Record<ToneVariant, string> = {
  critical: "bg-critical-soft text-critical",
  warning: "bg-warning-soft text-warning",
  success: "bg-m-green-soft text-m-green",
  info: "bg-m-blue-soft text-m-blue",
  neutral: "bg-line-soft text-ink-muted",
}

const DOT: Record<ToneVariant, string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  success: "bg-m-green",
  info: "bg-m-blue",
  neutral: "bg-ink-subtle",
}

/**
 * Live pill with a pulsing dot — used in headers to signal real-time data.
 * Matches `.live-pill` in the Miragon mockup.
 */
export function LivePill({
  tone = "info",
  children,
}: {
  tone?: ToneVariant
  children?: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${TONE[tone]}`}
    >
      <span className={`size-1.5 animate-pulse rounded-full ${DOT[tone]}`} />
      {children ?? "Live"}
    </span>
  )
}

/**
 * Status badge — solid pill with a colored dot, used in detail-page headers.
 * Matches `.status-badge` in the Miragon mockup.
 */
export function StatusBadge({
  tone = "critical",
  children,
}: {
  tone?: ToneVariant
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${TONE[tone]}`}
    >
      <span className={`size-1.5 animate-pulse rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  )
}

/**
 * Compact count badge — tabular numbers on a tinted background.
 * Used as the right-aligned indicator on group cards.
 */
export function CountPill({
  tone = "neutral",
  children,
}: {
  tone?: ToneVariant
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-2.5 py-0.5 text-sm font-semibold tabular-nums ${TONE[tone]}`}
    >
      {children}
    </span>
  )
}
