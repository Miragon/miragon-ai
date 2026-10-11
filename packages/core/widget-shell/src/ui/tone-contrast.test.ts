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

const themeCss = readFileSync(new URL("../../styles/theme.css", import.meta.url), "utf8")
const theme = parseThemeVariables(themeCss)

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

  it("re-declares every shell :root role under .dark (a light value must not reach html.dark)", () => {
    // :root and .dark both match <html class="dark">; the shell's :root
    // comes after the toolkit's .dark, so a role missing from the shell's
    // .dark block would paint its LIGHT value in dark.
    const blocks = [...themeCss.matchAll(/^(:root|\.dark) \{([^}]*)\}/gm)].slice(-2)
    expect(blocks.map(([, selector]) => selector)).toEqual([":root", ".dark"])
    const names = (body: string) => [...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]).sort()
    expect(names(blocks[1][2])).toEqual(names(blocks[0][2]))
  })

  it("measures a light-only brand override in dark too, where html.dark sees it", () => {
    // The template's example override (templates/composed-server globals.css)
    // without its .dark repeat: the light navy reaches the dark card in the
    // browser, so the guard must fail; with the repeat it passes. A customer
    // brand is the test data here, not a Miragon UI colour.
    /* brand-lint-disable */
    const light = ":root { --info: #0055aa; --info-soft: #e6f0fa; --info-ink: #0055aa; }"
    const dark = ".dark { --info: #6b9ce0; --info-soft: #14233a; --info-ink: #6b9ce0; }"
    /* brand-lint-enable */
    const findings = contrastFindings(parseThemeVariables(themeCss, light), toneContrastPairs())
    expect(findings.length).toBeGreaterThan(0)
    expect(findings.every((f) => f.startsWith("dark: "))).toBe(true)
    expect(findings).toContain("dark: TONE_INK.info on card")
    expect(
      contrastFindings(parseThemeVariables(themeCss, light, dark), toneContrastPairs()),
    ).toEqual([])
  })
})

/**
 * The neutral and interaction roles. Today's interim values (the toolkit's
 * shadcn neutrals) miss AA in exactly these places; the Miragon theme swap
 * fixes them (input edge 3.40:1, muted text 5.29:1). The focus role already
 * passes (the info navy, as the FilterBar's edge was before the role). The
 * list is a ratchet: a fixed gap fails here until it is deleted, a new gap
 * fails because it is not listed.
 */
const KNOWN_ROLE_GAPS = [
  "light: muted-foreground on muted",
  "light: input edge on background",
  "dark: input edge on background",
]

describe("role contrast (styles/theme.css, light + dark)", () => {
  it("misses AA only in the known interim gaps", () => {
    expect(contrastFindings(theme, ROLE_CONTRAST_PAIRS)).toEqual(KNOWN_ROLE_GAPS)
  })
})
