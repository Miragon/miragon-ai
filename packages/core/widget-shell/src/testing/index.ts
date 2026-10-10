/**
 * `@miragon-ai/widget-shell/testing` — the brand gates every widget package
 * runs in its own test suite (Node, never bundled into a view):
 *  - `catalogTextFindings` — the voice rules over a message catalog;
 *  - `scanGlyphs` — no Unicode glyphs or emoji as icons in widget code;
 *  - `parseThemeVariables` + `contrastFindings` with `toneContrastPairs()` /
 *    `ROLE_CONTRAST_PAIRS` — WCAG contrast of the theme, light and dark.
 * `scanGlyphs` parses sources with `typescript` (an optional peer).
 */
export {
  catalogTextFindings,
  type CatalogLanguage,
  type CatalogRule,
  type CatalogTextFinding,
  type CatalogTextOptions,
} from "./catalog-text.js"
export { FORBIDDEN_GLYPHS, glyphFindings, scanGlyphs, type GlyphFinding } from "./glyphs.js"
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
