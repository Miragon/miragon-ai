import type { ReactNode } from "react"
import { cn } from "./cn.js"
import { TONE_BORDER, TONE_DOT, TONE_SOFT, type ToneVariant } from "./tone-utils.js"

/**
 * Live pill with a pulsing dot: signals real-time data in a header. The
 * pulse respects reduced motion (CI §7).
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
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold",
        TONE_SOFT[tone],
        TONE_BORDER[tone],
        className,
      )}
    >
      <span className={`size-1.5 rounded-full motion-safe:animate-pulse ${TONE_DOT[tone]}`} />
      {children ?? "Live"}
    </span>
  )
}

/**
 * Status badge for detail-page headers: the tone's tint, edge and dot next to
 * black text (CI §3.3: the colour marks the state, the words say it).
 * Static dot; the pulse is {@link LivePill}'s live-data semantic.
 */
export function StatusBadge({
  tone = "danger",
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
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold",
        TONE_SOFT[tone],
        TONE_BORDER[tone],
        className,
      )}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${TONE_DOT[tone]}`} />
      {children}
    </span>
  )
}

/**
 * Compact count badge: black tabular digits on the tone's tint, edged in the
 * tone (the edge carries the state, never the digits). Used as the
 * right-aligned indicator on group cards. A count without a state stays
 * `neutral`.
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
      className={cn(
        "inline-flex min-w-10 items-center justify-center rounded-md border px-2.5 py-0.5 text-sm font-semibold tabular-nums",
        TONE_SOFT[tone],
        TONE_BORDER[tone],
      )}
    >
      {children}
    </span>
  )
}
