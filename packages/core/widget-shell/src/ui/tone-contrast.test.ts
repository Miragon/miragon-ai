import { describe, expect, it } from "vitest"
import {
  ROLE_CONTRAST_PAIRS,
  contrastFindings,
  measureContrast,
  parseThemeVariables,
  toneContrastPairs,
  toolkitThemeStylesheets,
} from "../testing/index.js"

/**
 * The tone model's promise, measured on the theme every view ships — the
 * toolkit's Miragon theme (`@miragon/mcp-toolkit-ui/theme.css` over the
 * vendored `--cd-*` tokens), which the shell no longer copies — in light AND
 * dark: every TONE_* entry reaches WCAG AA for what it is — 4.5:1 for the
 * text of a tint and the ink, 3:1 for dots, edges and icons (CI
 * modeler-tool-design §3.3/§3.7). A consumer's override runs the same pairs
 * over its own stylesheet (see the app's ui-stylesheet test).
 */

const shipped = toolkitThemeStylesheets()
const theme = parseThemeVariables(...shipped)

/**
 * The CI's own exemption (§3.3, mirrored by the toolkit's theme test): on a
 * light ground success green and amber reach only 1.67:1 / 1.83:1, so a status
 * is never colour alone — every toned dot, edge or icon sits next to words in
 * the foreground (StatusBadge, KpiGrid, CountPill do that). Their ink is the
 * foreground, so no TEXT pair is exempt. Shrink-only: a pair that reaches 3:1
 * fails below until it is deleted here, a new miss fails because it is not
 * listed.
 */
const CI_EXEMPT_LIGHT_STATUS = ["success", "warning"].flatMap((tone) => [
  `light: TONE_DOT.${tone} on card`,
  `light: TONE_ICON.${tone} on card`,
  `light: TONE_BORDER.${tone} on card`,
  `light: TONE_DOT.${tone} on background`,
  `light: TONE_ICON.${tone} on background`,
  `light: TONE_BORDER.${tone} on background`,
  `light: TONE_DOT.${tone} inside its tint`,
  `light: TONE_ICON.${tone} inside its tint`,
])

describe("tone contrast (the toolkit's Miragon theme, light + dark)", () => {
  it("measures every TONE_* entry in both modes", () => {
    const results = measureContrast(theme, toneContrastPairs())
    // 5 tones × (2 surfaces × 4–5 roles + 3 tint pairs), each in two modes.
    expect(results.length).toBeGreaterThanOrEqual(5 * 11 * 2)
    expect(new Set(results.map((r) => r.mode))).toEqual(new Set(["light", "dark"]))
  })

  it("every TONE_* entry reaches its minimum, apart from the CI's light status exemption", () => {
    expect(contrastFindings(theme, toneContrastPairs()).sort()).toEqual(
      [...CI_EXEMPT_LIGHT_STATUS].sort(),
    )
  })

  it("measures a light-only brand override in dark too, where html.dark sees it", () => {
    // A light-only `:root` override (the template brand.css's example without
    // its dark block): the light navy reaches the dark card in the browser,
    // so the guard must fail; with the dark repeat it passes. A customer
    // brand is the test data here, not a Miragon UI colour.
    /* brand-lint-disable */
    const light = ":root { --info: #0055aa; --info-soft: #e6f0fa; --info-ink: #0055aa; }"
    const dark = ".dark { --info: #6b9ce0; --info-soft: transparent; --info-ink: #6b9ce0; }"
    /* brand-lint-enable */
    const findings = contrastFindings(parseThemeVariables(...shipped, light), toneContrastPairs())
    expect(findings).toContain("dark: TONE_INK.info on card")
    expect(findings.filter((f) => f.startsWith("dark: "))).not.toEqual([])
    const repeated = contrastFindings(
      parseThemeVariables(...shipped, light, dark),
      toneContrastPairs(),
    )
    expect(repeated.sort()).toEqual([...CI_EXEMPT_LIGHT_STATUS].sort())
  })
})

describe("role contrast (the toolkit's Miragon theme, light + dark)", () => {
  it("reaches AA on every neutral and interaction role — the interim gaps are gone", () => {
    // The shadcn neutrals missed it on the input edge (1.26:1) and the quiet
    // text on muted (4.34:1); the Miragon roles reach 3.40:1 and 5.29:1.
    expect(contrastFindings(theme, ROLE_CONTRAST_PAIRS)).toEqual([])
  })
})
