import type { ReactNode } from "react"
import { cn } from "./cn.js"
import { TONE_DOT, TONE_SOFT, type ToneVariant } from "./tone-utils.js"

/**
 * Live pill with a pulsing dot — used in headers to signal real-time data.
 * Matches `.live-pill` in the Miragon mockup.
 */
export function LivePill({
  tone = "info",
  className,
  children,
}: {
  tone?: ToneVariant
  className?: string
  children?: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold",
        TONE_SOFT[tone],
        className,
      )}
    >
      <span className={`size-1.5 animate-pulse rounded-full ${TONE_DOT[tone]}`} />
      {children ?? "Live"}
    </span>
  )
}

/**
 * Status badge — solid pill with a colored dot, used in detail-page headers.
 * Matches `.status-badge` in the Miragon mockup. Static dot — the pulse is
 * {@link LivePill}'s live-data semantic.
 */
export function StatusBadge({
  tone = "critical",
  className,
  children,
}: {
  tone?: ToneVariant
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold",
        TONE_SOFT[tone],
        className,
      )}
    >
      <span className={`size-1.5 rounded-full ${TONE_DOT[tone]}`} />
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
      className={`inline-flex min-w-10 items-center justify-center rounded-md px-2.5 py-0.5 text-sm font-semibold tabular-nums ${TONE_SOFT[tone]}`}
    >
      {children}
    </span>
  )
}
