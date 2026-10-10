import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  ROLE_CONTRAST_PAIRS,
  contrastFindings,
  measureContrast,
  parseThemeVariables,
  toneContrastPairs,
} from "../testing/index.js"

/**
 * The tone model's promise, measured on the theme as shipped (styles/theme.css:
 * the toolkit's tokens + the shell's role variables), in light AND dark:
 * every TONE_* entry reaches WCAG AA for what it is — 4.5:1 for the text of a
 * tint and the ink, 3:1 for dots, edges and icons (CI modeler-tool-design
 * §3.3/§3.7). A consumer's override runs the same pairs over its own
 * stylesheet (see the app's ui-stylesheet test).
 */

const theme = parseThemeVariables(
  readFileSync(new URL("../../styles/theme.css", import.meta.url), "utf8"),
)

describe("tone contrast (styles/theme.css, light + dark)", () => {
  it("measures every TONE_* entry in both modes", () => {
    const results = measureContrast(theme, toneContrastPairs())
    // 5 tones × (2 surfaces × 4–5 roles + 3 tint pairs), each in two modes.
    expect(results.length).toBeGreaterThanOrEqual(5 * 11 * 2)
    expect(new Set(results.map((r) => r.mode))).toEqual(new Set(["light", "dark"]))
  })

  it("every TONE_* entry reaches its minimum", () => {
    expect(contrastFindings(theme, toneContrastPairs())).toEqual([])
  })
})

/**
 * The neutral and interaction roles. Today's interim values (the toolkit's
 * shadcn neutrals) miss AA in exactly these places; the Miragon theme swap
 * fixes them (focus 6.56:1, input edge 3.40:1, muted text 5.29:1). The list
 * is a ratchet: a fixed gap fails here until it is deleted, a new gap fails
 * because it is not listed.
 */
const KNOWN_ROLE_GAPS = [
  "light: muted-foreground on muted",
  "light: focus ring on card",
  "light: focus ring on background",
  "light: input edge on background",
  "dark: input edge on background",
]

describe("role contrast (styles/theme.css, light + dark)", () => {
  it("misses AA only in the known interim gaps", () => {
    expect(contrastFindings(theme, ROLE_CONTRAST_PAIRS)).toEqual(KNOWN_ROLE_GAPS)
  })
})
