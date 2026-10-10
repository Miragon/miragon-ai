import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"

/**
 * `styles/theme.css` is the toolkit's `globals.css` minus its forced font
 * (#339 — upstream split: mcp-toolkit#178). This pins the copy: the token
 * blocks, the dark variant and the base layer stay byte-identical to the
 * installed toolkit, and exactly the forced-font fragments (plus the two
 * path-bound lines the consumer owns) are left out. A toolkit bump that
 * changes the tokens fails here — re-copy them; one that drops a fragment
 * (the upstream fix) fails too — then retire this copy.
 */

const require = createRequire(import.meta.url)
const upstream = readFileSync(require.resolve("@miragon/mcp-toolkit-ui/globals.css"), "utf8")
const shell = readFileSync(new URL("../styles/theme.css", import.meta.url), "utf8")

/** What the copy leaves out, verbatim. */
const LEFT_OUT = [
  // The consumer imports Tailwind and declares the toolkit @source (path-bound).
  '@import "tailwindcss";\n',
  '\n@source "../**/*.{ts,tsx}";\n',
  // The forced font: ~61 KB of base64 per view, and a rule that beats the
  // host's font and every `font-mono`.
  '@import "@fontsource-variable/geist";\n',
  '  --font-sans: "Geist Variable", sans-serif;\n',
  '* {\n  font-family: "Geist Variable", ui-sans-serif, system-ui, sans-serif !important;\n}\n\n',
]

const ADDITIONS_MARKER = "/* ── Shell additions"

/** The copy without its leading header comment and the shell's own additions. */
function copiedBody(css: string): string {
  const afterHeader = css.replace(/^\/\*[\s\S]*?\*\/\n/, "")
  return afterHeader.slice(0, afterHeader.indexOf(ADDITIONS_MARKER)).trim()
}

describe("styles/theme.css (the toolkit's tokens without the forced font)", () => {
  it("leaves out fragments the toolkit still ships — none of them has been fixed upstream yet", () => {
    for (const fragment of LEFT_OUT) {
      expect(upstream, `toolkit changed — revisit theme.css: ${fragment.trim()}`).toContain(
        fragment,
      )
    }
  })

  it("is the toolkit's globals.css verbatim apart from those fragments", () => {
    const expected = LEFT_OUT.reduce((css, fragment) => css.replace(fragment, ""), upstream)
    expect(shell).toContain(ADDITIONS_MARKER)
    expect(copiedBody(shell)).toBe(expected.trim())
  })

  it("forces no font: no font import, no `!important` font-family, no Geist", () => {
    const rules = shell.replace(/\/\*[\s\S]*?\*\//g, "")
    expect(rules).not.toMatch(/@fontsource/)
    expect(rules).not.toMatch(/font-family[^;}]*!important/)
    expect(rules).not.toMatch(/Geist/)
  })
})
