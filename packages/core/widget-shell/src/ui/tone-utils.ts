/**
 * The status tone model: the single source of the class strings every kit
 * component (and every widget) uses to show a state. CI rule (modeler-tool-
 * design §3.3): a status colour is a FILL, DOT, BORDER or ICON, never the colour
 * of the words next to it. Each tone therefore has three roles, all theme
 * variables defined once in `styles/theme.css` (light + dark):
 *
 *  - `--<tone>`       fill / dot / border / icon — non-text, ≥ 3:1 on a card
 *  - `--<tone>-soft`  the tint of a badge, chip or soft card
 *  - `--<tone>-ink`   the TEXT colour of a tone (≥ 4.5:1 on its tint, the card
 *                     and the page); after the theme swap success/warning ink
 *                     is plain black, so never rely on it to carry the meaning
 *
 * Open incidents and failed jobs without retries are `danger`; a failed job
 * that still has retries and a degraded engine are `warning`. There is no
 * `critical` tone: one red, one amber. Counts without a state stay `neutral`,
 * and a number is never coloured: put a dot, icon or border next to black
 * text instead (KpiGrid does that for you).
 *
 * Use these maps instead of hand-rolled ternaries or palette classes, so a
 * tone only ever changes in one place. `tone-contrast.test.ts` checks every
 * entry against the theme in light AND dark.
 */
export type ToneVariant = "danger" | "warning" | "success" | "info" | "neutral"

/** Every tone, in severity order (for loops in tests and pickers). */
export const TONE_VARIANTS: readonly ToneVariant[] = [
  "danger",
  "warning",
  "success",
  "info",
  "neutral",
]

/** Tint + readable text: badges, chips, pills, soft cards. Pair with {@link TONE_BORDER}. */
export const TONE_SOFT: Record<ToneVariant, string> = {
  danger: "bg-danger-soft text-danger-ink",
  warning: "bg-warning-soft text-warning-ink",
  success: "bg-success-soft text-success-ink",
  info: "bg-info-soft text-info-ink",
  neutral: "bg-muted text-foreground",
}

/** The tint alone, for a surface whose text stays neutral (a soft KPI card). */
export const TONE_TINT: Record<ToneVariant, string> = {
  danger: "bg-danger-soft",
  warning: "bg-warning-soft",
  success: "bg-success-soft",
  info: "bg-info-soft",
  neutral: "bg-muted",
}

/** Solid fill: status dots next to a label, bars, meter fills. */
export const TONE_DOT: Record<ToneVariant, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
  info: "bg-info",
  neutral: "bg-muted-foreground",
}

/** The edge of a tinted badge, a selected chip or a status card. Neutral is decorative. */
export const TONE_BORDER: Record<ToneVariant, string> = {
  danger: "border-danger",
  warning: "border-warning",
  success: "border-success",
  info: "border-info",
  neutral: "border-border",
}

/** `currentColor` of a status icon (Lucide via `Icon`). Icons only, never words. */
export const TONE_ICON: Record<ToneVariant, string> = {
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
  info: "text-info",
  neutral: "text-muted-foreground",
}

/**
 * The readable text colour of a tone on a card or the page: an inline error
 * line, a trend note. Keep the words themselves meaningful; the ink only
 * reinforces them.
 */
export const TONE_INK: Record<ToneVariant, string> = {
  danger: "text-danger-ink",
  warning: "text-warning-ink",
  success: "text-success-ink",
  info: "text-info-ink",
  neutral: "text-muted-foreground",
}

/** Micro-label typography: table headers, KPI strip headers, group labels. */
export const MICRO_LABEL = "text-[11px] font-semibold uppercase tracking-wide"
