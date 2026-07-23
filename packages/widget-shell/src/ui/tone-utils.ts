/**
 * Single source of truth for severity/brand "tones" used across widgets.
 *
 * Tones map to the brand tokens defined in the server app's globals.css
 * (`--color-critical`, `--color-warning`, `--color-m-green`, `--color-m-blue`)
 * plus the shadcn neutral ramp for the `neutral` tone. All tokens carry
 * light + dark variants, so these class strings re-theme automatically.
 *
 * Use these maps instead of hand-rolling `tone === "x" ? "..." : "..."` ternaries
 * so a tone only ever needs editing in one place.
 */
export type ToneVariant = "critical" | "warning" | "success" | "info" | "neutral"

/** Tinted background + readable foreground — badges, icon tiles, pills. */
export const TONE_SOFT: Record<ToneVariant, string> = {
  critical: "bg-critical-soft text-critical",
  warning: "bg-warning-soft text-warning",
  success: "bg-m-green-soft text-m-green",
  info: "bg-m-blue-soft text-m-blue",
  neutral: "bg-muted text-muted-foreground",
}

/** Solid dot color — status dots next to a label. */
export const TONE_DOT: Record<ToneVariant, string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  success: "bg-m-green",
  info: "bg-m-blue",
  neutral: "bg-muted-foreground",
}

/** Foreground-only color — metric values, inline emphasis. */
export const TONE_TEXT: Partial<Record<ToneVariant, string>> = {
  critical: "text-critical",
  warning: "text-warning",
  success: "text-m-green",
  info: "text-m-blue",
}

/** Micro-label typography — table headers, KPI strip headers, group labels. */
export const MICRO_LABEL = "text-[11px] font-semibold uppercase tracking-wide"
