import type { LucideIcon } from "lucide-react"
import { cn } from "@miragon/mcp-toolkit-ui"

export type { LucideIcon }

/**
 * Lucide stroke widths of the CI (modeler-tool-design §11, on the 24 grid),
 * the same values the toolkit's `McpAppView` sets through `LucideProvider`
 * (2.5 for everything it renders, 2 in its dense toolbar). One mechanism for
 * the whole view: lucide-react's own `strokeWidth`, never a CSS rule (a
 * `stroke-width` declaration beats the SVG attribute and would override the
 * toolkit's dense bars).
 */
export const ICON_STROKE = 2.5
/** Stroke in dense bars and table rows (`Icon dense`). */
export const DENSE_ICON_STROKE = 2

/**
 * A Lucide function icon the way the CI draws it (modeler-tool-design §11):
 * `currentColor`, 16 px in chrome, stroke {@link ICON_STROKE} in the 24 grid
 * ({@link DENSE_ICON_STROKE} with `dense`, for tight bars and table rows).
 * The stroke is set on the icon itself, so it holds wherever the widget
 * renders — inside the toolkit's view (whose `LucideProvider` sets the same
 * default for raw Lucide icons) or outside it.
 *
 * Decorative by default (`aria-hidden`): the button or text next to it names
 * the action. Pass `label` only for a standalone icon that carries meaning on
 * its own (a status icon without words). Tint it with `TONE_ICON[tone]`.
 *
 * Never draw an icon with a Unicode glyph or emoji: `scanGlyphs` from
 * `@miragon/pulse-widget-shell/testing` fails the package that does.
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
      strokeWidth={dense ? DENSE_ICON_STROKE : ICON_STROKE}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable="false"
      className={cn("shrink-0", className)}
    />
  )
}
