import { readFileSync } from "node:fs"
import {
  lineOf,
  literalText,
  parseSource,
  relativePath,
  sourceFiles,
  walkNodes,
} from "./source-scan.js"

/**
 * The colour gate (CLAUDE.md "Design-System", invariant 6; brand-review B1):
 * components use role names only (`text-danger-ink`, `bg-info-soft`,
 * `border-focus` …), never Tailwind palette classes or raw colours, so a
 * brand changes in the theme, not in every widget. brand-lint cannot see
 * either inside `.ts`/`.tsx` (it checks colours, not Tailwind classes, and
 * no TS strings), so every widget package runs this in its own tests:
 *
 *   expect(scanColors(widgetsDir, { allow: { "x.ts": "why" } })).toEqual([])
 *
 * It reads string and template literals (class lists, inline styles), never
 * comments or visible JSX text. It also fails the retired accents, as a
 * class (`text-m-blue`, `bg-critical-soft` …) and as a variable reference
 * (`text-[var(--m-blue)]`, `{ color: "var(--critical)" }`): their variables
 * left with the Miragon theme, so either would now style nothing — silently.
 *
 * Stylesheets get the same rule through {@link stylesheetColorFindings}: a
 * consumer's CSS overrides role variables on top of the toolkit's theme and
 * names no raw colour outside comments.
 */

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose"
const UTILITY =
  "bg|text|border|ring|outline|fill|stroke|from|via|to|divide|decoration|accent|caret|placeholder|shadow|inset-shadow|inset-ring"

/** `text-red-600`, `hover:bg-purple-500/40`, `border-t-amber-300`, `bg-black/50`. */
const PALETTE_CLASS = new RegExp(
  `(?<![\\w-])(?:${UTILITY})(?:-[a-z]+)?-(?:(?:${PALETTE})-(?:50|[1-9]00|950)|black|white)(?![\\w-])`,
  "g",
)

/**
 * The accent classes the Miragon theme retired (`--m-blue*`, `--m-green*`,
 * the `critical` tone): `text-m-blue`, `bg-m-blue-soft`, `border-critical`.
 * Use the roles instead (`text-link`, `bg-accent`, `danger`).
 */
const RETIRED_ROLE_CLASS = new RegExp(
  `(?<![\\w-])(?:${UTILITY})(?:-[a-z]+)?-(?:m-(?:blue|green)(?:-(?:light|soft))?|critical(?:-(?:soft|ink))?)(?![\\w-])`,
  "g",
)

/**
 * The same retired accents referenced as a variable: in an arbitrary value
 * (`text-[var(--m-blue)]`, `border-[color:var(--critical)]`), an inline style
 * (`{ color: "var(--m-blue)" }`) or through Tailwind's registration
 * (`var(--color-m-blue-soft)`). The variable no longer exists, so the colour
 * falls back to the inherited or initial value without a build error.
 */
const RETIRED_ROLE_VARIABLE =
  /(?<![\w-])--(?:color-)?(?:m-(?:blue|green)(?:-(?:light|soft))?|critical(?:-(?:soft|ink))?)(?![\w-])/g

/** `#fff`, `#1b3b6f80` (3, 4, 6 or 8 hex digits, never part of an id like `#root`). */
const HEX = /(?<![\w&#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g

/** `rgba(`, `oklch(`, `hsl(`, `color(` … (`color-mix(` over role variables stays allowed). */
const COLOR_FUNCTION = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g

export interface ColorFinding {
  file: string
  line: number
  /** The palette class, hex value or colour function found. */
  match: string
  text: string
}

/** Every palette class and raw colour in the string and template literals of one source file. */
export function colorFindings(source: string, file: string): ColorFinding[] {
  const sf = parseSource(source, file)
  const findings: ColorFinding[] = []
  walkNodes(sf, (node) => {
    const text = literalText(node)
    if (text === undefined) return
    const matches = [PALETTE_CLASS, RETIRED_ROLE_CLASS, RETIRED_ROLE_VARIABLE, HEX, COLOR_FUNCTION]
      .flatMap((pattern) => [...text.matchAll(pattern)])
      .sort((a, b) => a.index - b.index)
    for (const [match] of matches) {
      findings.push({ file, line: lineOf(sf, node), match, text: text.trim().slice(0, 80) })
    }
  })
  return findings
}

/**
 * A stylesheet with its comments blanked out, newlines kept (so line numbers
 * stay true). A linear scan, not a lazy regex: it reads consumer stylesheets.
 */
function blankComments(css: string): string {
  let out = ""
  let at = 0
  for (;;) {
    const open = css.indexOf("/*", at)
    if (open === -1) return out + css.slice(at)
    out += css.slice(at, open)
    const close = css.indexOf("*/", open + 2)
    const end = close === -1 ? css.length : close + 2
    out += css.slice(open, end).replace(/[^\n]/g, " ")
    if (close === -1) return out
    at = end
  }
}

/**
 * Every raw colour (hex, `rgb()`, `oklch()` …) and every reference to a
 * retired accent variable (`var(--m-blue)`) in a stylesheet's rules —
 * comments are skipped, so a commented-out example may hold the values a
 * customer is meant to fill in. A consumer stylesheet imports the toolkit's
 * theme and overrides role variables; a brand value it does set belongs in
 * that override block and its own allowance, never in a component rule.
 */
export function stylesheetColorFindings(css: string, file: string): ColorFinding[] {
  const rules = blankComments(css)
  const findings: ColorFinding[] = []
  const lines = rules.split("\n")
  lines.forEach((text, index) => {
    const matches = [RETIRED_ROLE_VARIABLE, HEX, COLOR_FUNCTION]
      .flatMap((pattern) => [...text.matchAll(pattern)])
      .sort((a, b) => a.index - b.index)
    for (const [match] of matches) {
      findings.push({ file, line: index + 1, match, text: text.trim().slice(0, 80) })
    }
  })
  return findings
}

export interface ScanColorsOptions {
  /**
   * Files (relative to the scanned dir, "/"-separated) that may hold raw
   * colours, each with its reason (e.g. the BPMN paper is always light). A
   * shrink-only list: an entry whose file no longer has a finding, or no
   * longer exists, comes back as an "unused allowance".
   */
  allow?: Readonly<Record<string, string>>
}

/**
 * Scan every `.ts`/`.tsx` source under `dir` (tests and declarations
 * excluded) for palette classes and raw colours. Findings carry
 * "/"-separated paths relative to `dir`.
 */
export function scanColors(dir: string, options: ScanColorsOptions = {}): ColorFinding[] {
  const allow = options.allow ?? {}
  for (const [file, reason] of Object.entries(allow)) {
    if (!reason.trim()) throw new Error(`The allowance for ${file} needs a reason`)
  }
  const perFile = sourceFiles(dir).map((path) => {
    const file = relativePath(dir, path)
    return { file, findings: colorFindings(readFileSync(path, "utf8"), file) }
  })
  const unused = Object.entries(allow)
    .filter(([file]) => !perFile.some((f) => f.file === file && f.findings.length > 0))
    .map(([file, reason]) => ({ file, line: 0, match: "unused allowance", text: reason }))
  return [...perFile.filter((f) => !(f.file in allow)).flatMap((f) => f.findings), ...unused]
}
