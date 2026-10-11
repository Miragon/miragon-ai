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
 * comments or visible JSX text.
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
    const matches = [PALETTE_CLASS, HEX, COLOR_FUNCTION]
      .flatMap((pattern) => [...text.matchAll(pattern)])
      .sort((a, b) => a.index - b.index)
    for (const [match] of matches) {
      findings.push({ file, line: lineOf(sf, node), match, text: text.trim().slice(0, 80) })
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
