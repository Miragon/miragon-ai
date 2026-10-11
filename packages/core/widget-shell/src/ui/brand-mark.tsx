import type { ReactNode } from "react"
import { cn, EmptyState, type StateHeadingLevel } from "@miragon/mcp-toolkit-ui"
import { KOMET_SVG } from "./komet-svg.js"

/** The Komet never renders smaller than this (CI: legible as the Miragon icon). */
export const KOMET_MIN_SIZE = 24

/**
 * The Miragon signature for APP-LEVEL surfaces only — the landing, the first
 * start, "no engines" (owner decision; never in every widget): the official
 * Komet icon, inlined unchanged ({@link KOMET_SVG}), at `size` px (at least
 * {@link KOMET_MIN_SIZE}).
 *
 * A theme slot hides it: a customer brand sets
 * `--brand-mark-display: none` in its stylesheet (`brand.css`) and every
 * Miragon mark disappears, without a code change. Decorative by default
 * (the words next to it carry the meaning); pass `label` for a mark that
 * stands alone.
 */
export function KometMark({
  size = 48,
  label,
  className,
}: {
  size?: number
  label?: string
  className?: string
}) {
  const px = Math.max(KOMET_MIN_SIZE, size)
  return (
    <span
      data-brand-mark="komet"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0 items-center justify-center [&>svg]:size-full!", className)}
      style={{ display: "var(--brand-mark-display, inline-flex)", width: px, height: px }}
      // The CI's file, byte for byte — no JSX re-drawing of the mark.
      dangerouslySetInnerHTML={{ __html: KOMET_SVG }}
    />
  )
}

/**
 * The empty state of an APP-LEVEL surface (CI §8 "Empty State / Landing"):
 * the Komet over a 600 title, one help line and up to two actions — the
 * primary one a blue `Button`. Widgets use `TableEmptyState` instead; the
 * Komet belongs to the app, not to every list.
 */
export function AppEmptyState({
  title,
  description,
  action,
  secondaryAction,
  titleAs = "h2",
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  secondaryAction?: ReactNode
  /** Default `"h2"`: it is the surface's heading. */
  titleAs?: StateHeadingLevel
  className?: string
}) {
  return (
    <EmptyState
      icon={<KometMark />}
      title={title}
      description={description}
      action={action}
      secondaryAction={secondaryAction}
      titleAs={titleAs}
      className={cn("py-12", className)}
    />
  )
}
