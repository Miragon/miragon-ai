import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  contrastFindings,
  parseThemeVariables,
  toneContrastPairs,
} from "@miragon-ai/widget-shell/testing"

/**
 * #339 guard over the stylesheets every view document inlines: the app's
 * own, the customer template's, and the shell theme both import. Two
 * regressions are pinned here at the source (test:host re-checks the BUILT
 * bundle):
 *  - a `min-height` floor on html/body/#root — auto-resize measures the
 *    document, so every inline view (a three-cell KPI strip included) was at
 *    least 600 px tall in the chat;
 *  - a forced font — `font-family … !important` beats the host's font AND
 *    every `font-mono` (stack traces, ids). The toolkit's globals.css carries
 *    exactly that rule plus ~61 KB of base64 Geist, so it must never be
 *    imported again; the shell theme is its font-free copy.
 */

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8")

const STYLESHEETS = {
  app: read("../src/ui/globals.css"),
  template: read("../../../templates/composed-server/server/src/ui/globals.css"),
  shellTheme: read("../../../packages/core/widget-shell/styles/theme.css"),
}

/** Rules only — a comment may name what it forbids. */
const rulesOf = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "")

/** Every rule block whose selector list targets html, body or #root. */
function documentRules(css: string): string[] {
  return [...rulesOf(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => selector.split(",").some((s) => /^\s*(html|body|#root)\s*$/.test(s)))
    .map(([rule]) => rule)
}

describe("view stylesheets (#339)", () => {
  it.each(Object.entries(STYLESHEETS))("%s: puts no height floor on html/body/#root", (_, css) => {
    for (const rule of documentRules(css)) expect(rule).not.toMatch(/min-height/)
  })

  it.each(Object.entries(STYLESHEETS))("%s: forces no font", (_, css) => {
    expect(rulesOf(css)).not.toMatch(/font-family[^;}]*!important/)
    expect(rulesOf(css)).not.toMatch(/@fontsource|Geist/)
  })

  it.each([
    ["app", STYLESHEETS.app],
    ["template", STYLESHEETS.template],
  ])("%s: builds on the font-free shell theme, never the toolkit's globals.css", (_, css) => {
    const rules = rulesOf(css)
    expect(rules).toContain('@import "@miragon-ai/widget-shell/theme.css"')
    expect(rules).not.toContain("@miragon/mcp-toolkit-ui/globals.css")
    // The theme cannot know where the toolkit is installed — the consumer
    // scans its components (Card, Skeleton, the view toolbar …) itself.
    expect(rules).toMatch(/@source "[^"]*node_modules\/@miragon\/mcp-toolkit-ui\/src"/)
  })
})

/**
 * The tone model across the stylesheet stack a consumer ships: the shell
 * theme defines every role once, the app and the customer template may only
 * override role names on top. Whatever they override has to keep the tone
 * pairs at WCAG AA in light AND dark (text 4.5:1, dots/edges/icons 3:1); the
 * retired `critical` tone must not come back.
 */
describe("view stylesheets: tone roles", () => {
  it.each([
    ["app", STYLESHEETS.app],
    ["template", STYLESHEETS.template],
  ])("%s: every TONE_* pair reaches AA over the shell theme", (_, css) => {
    const theme = parseThemeVariables(STYLESHEETS.shellTheme, css)
    expect(contrastFindings(theme, toneContrastPairs())).toEqual([])
  })

  it.each(Object.entries(STYLESHEETS))("%s: no retired critical tone", (_, css) => {
    expect(rulesOf(css)).not.toMatch(/--(color-)?critical/)
  })
})
