/**
 * `@miragon-ai/widget-shell/testing` — the brand gates every widget package
 * runs in its own test suite (Node, never bundled into a view):
 *  - `catalogTextFindings` — the voice rules over a message catalog;
 *  - `scanGlyphs` — no Unicode glyphs, emoji or sparkle icons in widget code;
 *  - `scanColors` — role names only, no palette classes or raw colours;
 *  - `parseThemeVariables` + `contrastFindings` with `toneContrastPairs()` /
 *    `ROLE_CONTRAST_PAIRS` — WCAG contrast of the theme, light and dark;
 *  - `setFormatLocale` — render numbers and dates in a language in a test.
 * `scanGlyphs` and `scanColors` parse sources with `typescript` (an optional
 * peer).
 */
export {
  catalogTextFindings,
  type CatalogAllowance,
  type CatalogLanguage,
  type CatalogRule,
  type CatalogTextFinding,
  type CatalogTextOptions,
} from "./catalog-text.js"
export { FORBIDDEN_GLYPHS, glyphFindings, scanGlyphs, type GlyphFinding } from "./glyphs.js"
export { colorFindings, scanColors, type ColorFinding, type ScanColorsOptions } from "./colors.js"
export {
  composite,
  contrastFindings,
  contrastRatio,
  measureContrast,
  parseThemeVariables,
  resolveColor,
  type ContrastPair,
  type ContrastResult,
  type Rgba,
  type ThemeMode,
  type ThemeVariables,
} from "./contrast.js"
export { ROLE_CONTRAST_PAIRS, toneContrastPairs } from "./tone-pairs.js"
/**
 * The format locale the shell's ProfileGate publishes, for tests that render
 * a widget's numbers and dates in a given language without booting the gate
 * (`afterEach(() => setFormatLocale(undefined))` restores the defaults).
 */
export { setFormatLocale, type FormatLocale } from "../ui/format.js"
