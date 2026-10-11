import {
  TONE_BORDER,
  TONE_DOT,
  TONE_ICON,
  TONE_INK,
  TONE_SOFT,
  TONE_VARIANTS,
  type ToneVariant,
} from "../ui/tone-utils.js"
import type { ContrastPair } from "./contrast.js"

/** `bg-danger-soft text-danger-ink` + `"text"` → `--color-danger-ink` (the Tailwind theme variable). */
function classVariable(classes: string, prefix: "bg" | "text" | "border"): string {
  const token = classes.split(/\s+/).find((c) => c.startsWith(`${prefix}-`))
  if (!token) throw new Error(`No ${prefix}-* class in "${classes}"`)
  return `--color-${token.slice(prefix.length + 1)}`
}

const SURFACES = ["--color-card", "--color-background"] as const

function surfacePairs(tone: ToneVariant, surface: string): ContrastPair[] {
  const soft = TONE_SOFT[tone]
  const on = `on ${surface.replace("--color-", "")}`
  const pairs: ContrastPair[] = [
    {
      label: `TONE_SOFT.${tone}: text on its tint ${on}`,
      fg: classVariable(soft, "text"),
      bg: classVariable(soft, "bg"),
      over: surface,
      min: 4.5,
    },
    {
      label: `TONE_INK.${tone} ${on}`,
      fg: classVariable(TONE_INK[tone], "text"),
      bg: surface,
      over: surface,
      min: 4.5,
    },
    {
      label: `TONE_DOT.${tone} ${on}`,
      fg: classVariable(TONE_DOT[tone], "bg"),
      bg: surface,
      over: surface,
      min: 3,
    },
    {
      label: `TONE_ICON.${tone} ${on}`,
      fg: classVariable(TONE_ICON[tone], "text"),
      bg: surface,
      over: surface,
      min: 3,
    },
  ]
  // The neutral edge is a decorative line (CI: --cd-linie, no contrast claim).
  if (tone !== "neutral") {
    pairs.push({
      label: `TONE_BORDER.${tone} ${on}`,
      fg: classVariable(TONE_BORDER[tone], "border"),
      bg: surface,
      over: surface,
      min: 3,
    })
  }
  return pairs
}

/**
 * Every pair the tone model promises, per tone: the tint's text, the ink,
 * dot, icon and edge on the card and the page (text 4.5:1, the rest 3:1),
 * the dot and icon inside the tint, and plain foreground text on the tint
 * (a soft KPI card). Derived from the TONE_* maps themselves, so a new
 * class there is measured without touching the test.
 */
export function toneContrastPairs(): ContrastPair[] {
  return TONE_VARIANTS.flatMap((tone) => {
    const tint = classVariable(TONE_SOFT[tone], "bg")
    return [
      ...SURFACES.flatMap((surface) => surfacePairs(tone, surface)),
      {
        label: `TONE_DOT.${tone} inside its tint`,
        fg: classVariable(TONE_DOT[tone], "bg"),
        bg: tint,
        min: 3,
      },
      {
        label: `TONE_ICON.${tone} inside its tint`,
        fg: classVariable(TONE_ICON[tone], "text"),
        bg: tint,
        min: 3,
      },
      { label: `foreground on the ${tone} tint`, fg: "--color-foreground", bg: tint, min: 4.5 },
    ]
  })
}

/**
 * The neutral and interaction roles of the theme contract (CI §3.2/§12):
 * text on every surface, every `<role>-foreground` on its fill (primary at
 * rest and on hover, secondary, accent — the hover and selected surface —,
 * destructive, popover), the link, both focus indicators (`--focus`, the
 * outline; `--ring`, the `focus-visible:ring-ring` utilities) and the input
 * edge. Text 4.5:1, the rest 3:1. A role a consumer may override belongs in
 * this list, so a brand that breaks it fails the suite that measures it.
 */
export const ROLE_CONTRAST_PAIRS: readonly ContrastPair[] = [
  {
    label: "foreground on background",
    fg: "--foreground",
    bg: "--background",
    over: "--background",
    min: 4.5,
  },
  { label: "foreground on card", fg: "--foreground", bg: "--card", min: 4.5 },
  { label: "card-foreground on card", fg: "--card-foreground", bg: "--card", min: 4.5 },
  { label: "popover-foreground on popover", fg: "--popover-foreground", bg: "--popover", min: 4.5 },
  { label: "muted-foreground on card", fg: "--muted-foreground", bg: "--card", min: 4.5 },
  {
    label: "muted-foreground on background",
    fg: "--muted-foreground",
    bg: "--background",
    over: "--background",
    min: 4.5,
  },
  { label: "muted-foreground on muted", fg: "--muted-foreground", bg: "--muted", min: 4.5 },
  { label: "primary-foreground on primary", fg: "--primary-foreground", bg: "--primary", min: 4.5 },
  {
    label: "primary-foreground on primary-hover",
    fg: "--primary-foreground",
    bg: "--primary-hover",
    min: 4.5,
  },
  {
    label: "secondary-foreground on secondary",
    fg: "--secondary-foreground",
    bg: "--secondary",
    min: 4.5,
  },
  { label: "accent-foreground on accent", fg: "--accent-foreground", bg: "--accent", min: 4.5 },
  {
    label: "destructive-foreground on destructive",
    fg: "--destructive-foreground",
    bg: "--destructive",
    min: 4.5,
  },
  { label: "link on card", fg: "--link", bg: "--card", min: 4.5 },
  { label: "link on background", fg: "--link", bg: "--background", over: "--background", min: 4.5 },
  { label: "focus ring on card", fg: "--focus", bg: "--card", min: 3 },
  {
    label: "focus ring on background",
    fg: "--focus",
    bg: "--background",
    over: "--background",
    min: 3,
  },
  { label: "ring on card", fg: "--ring", bg: "--card", min: 3 },
  { label: "ring on background", fg: "--ring", bg: "--background", over: "--background", min: 3 },
  {
    label: "input edge on background",
    fg: "--input",
    bg: "--background",
    over: "--background",
    min: 3,
  },
]
