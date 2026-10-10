import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"

/**
 * The glyph gate (CI: modeler-tool-design §11, brand-review B9/U4/U8). Widget
 * UI draws function icons with Lucide (the kit's `Icon`), never with Unicode
 * glyphs or emoji: they render in whatever font the host has (⚙ and ⏱ came
 * out as colour emoji), carry no accessible name and mix icon styles. ✦ is
 * the AI-sparkle the CI rules out.
 */
export const FORBIDDEN_GLYPHS: readonly string[] = [
  "✦",
  "⊡",
  "▦",
  "↗",
  "›",
  "⚠",
  "⚙",
  "⏱",
  "⤧",
  "▶",
  "✓",
  "✕",
  "▤",
  "⊞",
  "↻",
]

const EMOJI = /\p{Extended_Pictographic}/u

export interface GlyphFinding {
  file: string
  line: number
  glyph: string
  text: string
}

function offendingGlyph(text: string): string | undefined {
  return FORBIDDEN_GLYPHS.find((g) => text.includes(g)) ?? EMOJI.exec(text)?.[0]
}

/** The text nodes a user can see: string and template literals, and JSX text. */
function visibleText(node: ts.Node): string | undefined {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node) ||
    ts.isJsxText(node)
  ) {
    return node.text
  }
  return undefined
}

/**
 * Forbidden glyphs and emoji in the string literals and JSX text of one
 * source file (comments are not scanned: a comment may name what it bans).
 */
export function glyphFindings(source: string, file: string): GlyphFinding[] {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
  const findings: GlyphFinding[] = []
  const visit = (node: ts.Node) => {
    const text = visibleText(node)
    const glyph = text === undefined ? undefined : offendingGlyph(text)
    if (text !== undefined && glyph) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
      findings.push({ file, line: line + 1, glyph, text: text.trim().slice(0, 80) })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return findings
}

const SKIP_DIRS = new Set(["node_modules", "dist", "coverage"])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path)
    const isSource = /\.tsx?$/.test(entry.name) && !/\.(test|spec|d)\.tsx?$/.test(entry.name)
    return isSource ? [path] : []
  })
}

/**
 * Scan every `.ts`/`.tsx` source under `dir` (tests and declarations
 * excluded). Point it at a package's widget and message-catalog folders;
 * findings carry paths relative to `dir`.
 */
export function scanGlyphs(dir: string): GlyphFinding[] {
  return sourceFiles(dir).flatMap((path) =>
    glyphFindings(readFileSync(path, "utf8"), relative(dir, path)),
  )
}
