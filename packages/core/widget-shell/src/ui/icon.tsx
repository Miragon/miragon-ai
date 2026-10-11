import type { LucideIcon } from "lucide-react"
import { cn } from "./cn.js"

export type { LucideIcon }

/**
 * A Lucide function icon the way the CI draws it (modeler-tool-design §11):
 * `currentColor`, 16 px in chrome, stroke 2.5 in the 24 grid (2 with
 * `dense`, for tight bars and table rows). The stroke is set once in
 * `theme.css`, so it also holds for Lucide icons a toolkit component renders.
 *
 * Decorative by default (`aria-hidden`): the button or text next to it names
 * the action. Pass `label` only for a standalone icon that carries meaning on
 * its own (a status icon without words). Tint it with `TONE_ICON[tone]`.
 *
 * Never draw an icon with a Unicode glyph or emoji: `scanGlyphs` from
 * `@miragon-ai/widget-shell/testing` fails the package that does.
 */
export function Icon({
  icon: Glyph,
  size = 16,
  dense = false,
  label,
  className,
}: {
  icon: LucideIcon
  size?: number
  dense?: boolean
  /** Accessible name for an icon that stands alone; omit when text names it. */
  label?: string
  className?: string
}) {
  return (
    <Glyph
      size={size}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable="false"
      data-icon-density={dense ? "dense" : undefined}
      className={cn("shrink-0", className)}
    />
  )
}
