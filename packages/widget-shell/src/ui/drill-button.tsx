import type { ReactNode } from "react"

/**
 * The single deterministic in-app navigation control (drill into a detail / sub-view).
 * Intentionally NEUTRAL (outline + muted) with a trailing → so the cockpit's accent
 * colour stays reserved for the AI ✦ affordances — "AI first": the agentic actions are
 * the visually prominent layer, navigation is the quiet, predictable one. Use this for
 * EVERY in-app drill (row "Open", header nav, etc.) so they look and read identically.
 */
export function DrillButton({
  children,
  onClick,
  icon,
  size = "sm",
  ariaLabel,
}: {
  children: ReactNode
  onClick: () => void
  /** Optional leading glyph (e.g. a domain icon). The trailing → is always rendered. */
  icon?: ReactNode
  /** `sm` for table rows, `md` for surface headers. */
  size?: "sm" | "md"
  ariaLabel?: string
}) {
  const pad = size === "md" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`border-border text-foreground hover:bg-muted focus-visible:ring-ring inline-flex items-center gap-1 rounded-md border font-medium outline-none transition-colors focus-visible:ring-2 ${pad}`}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
      <span aria-hidden="true">→</span>
    </button>
  )
}
