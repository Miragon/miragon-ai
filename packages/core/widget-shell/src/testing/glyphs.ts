import { readFileSync } from "node:fs"
import ts from "typescript"
import {
  lineOf,
  literalText,
  parseSource,
  relativePath,
  sourceFiles,
  walkNodes,
} from "./source-scan.js"

/**
 * The glyph gate (CI: modeler-tool-design §11, brand-review B9/U4/U8). Widget
 * UI draws function icons with Lucide (the kit's `Icon`), never with Unicode
 * glyphs or emoji: they render in whatever font the host has (⚙ and ⏱ came
 * out as colour emoji), carry no accessible name and mix icon styles. ✦ is
 * the AI-sparkle the CI rules out, × the close/remove icon (Lucide `X`).
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
  "×",
]

/**
 * Emoji, minus the Arrows block (U+2190–U+21FF): ↔ ↕ ↩ count as pictographic
 * only for their emoji variant. In running text an arrow is typography like
 * →; as an icon it is caught as a lone symbol, and ↗ ↻ are listed above.
 */
const EMOJI = /(?![←-⇿])\p{Extended_Pictographic}/u

/**
 * A symbol and nothing else (arrows, −, +, ⌄, ‹ ›, a lone ! or ?). As the
 * whole content of a JSX element that is the glyph-as-icon signature
 * (`<span aria-hidden>→</span>`); in running text the same symbol is
 * typography and stays allowed.
 */
const LONE_SYMBOL = /^[\p{Sm}\p{So}\p{Pi}\p{Pf}!?]+$/u

/** Lucide's AI sparkle in every export spelling (CI U4: never the AI affordance). */
const SPARKLE_IMPORT = /^(Lucide)?(Sparkles?|WandSparkles|Wand2)(Icon)?$/
/** …and as a deep import (`lucide-react/icons/sparkles`). */
const SPARKLE_PATH = /^lucide-react\/(?:.*\/)?(sparkles?|wand-sparkles|wand-2)(?:\.js)?$/

export interface GlyphFinding {
  file: string
  line: number
  glyph: string
  text: string
}

function offendingGlyph(text: string): string | undefined {
  return FORBIDDEN_GLYPHS.find((g) => text.includes(g)) ?? EMOJI.exec(text)?.[0]
}

/** Whether `node` is its JSX parent's only child (whitespace text and empty `{}` aside). */
function isOnlyJsxChild(node: ts.Node): boolean {
  const parent = node.parent
  if (!(ts.isJsxElement(parent) || ts.isJsxFragment(parent))) return false
  const meaningful = parent.children.filter((child) =>
    ts.isJsxText(child)
      ? child.text.trim() !== ""
      : !(ts.isJsxExpression(child) && !child.expression),
  )
  return meaningful.length === 1 && meaningful[0] === node
}

const VALUE_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
])

/** Whether a literal renders as its JSX element's whole content: `{"×"}`, `{open ? "▲" : "▼"}`. */
function rendersAsWholeElement(literal: ts.Node): boolean {
  let current = literal
  for (;;) {
    const parent = current.parent
    const passesValueThrough =
      ts.isParenthesizedExpression(parent) ||
      (ts.isConditionalExpression(parent) && parent.condition !== current) ||
      (ts.isBinaryExpression(parent) &&
        parent.right === current &&
        VALUE_OPERATORS.has(parent.operatorToken.kind))
    if (!passesValueThrough) return ts.isJsxExpression(parent) && isOnlyJsxChild(parent)
    current = parent
  }
}

function loneSymbolIcon(node: ts.Node, text: string): string | undefined {
  const symbol = text.trim()
  if (!LONE_SYMBOL.test(symbol)) return undefined
  const whole = ts.isJsxText(node) ? isOnlyJsxChild(node) : rendersAsWholeElement(node)
  return whole ? symbol : undefined
}

/** The sparkle icons an import pulls in from lucide-react, each with its node. */
function sparkleImports(node: ts.Node): [glyph: string, at: ts.Node][] {
  if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return []
  const from = node.moduleSpecifier.text
  const deep = SPARKLE_PATH.exec(from)
  if (deep) return [[deep[1], node]]
  const named = node.importClause?.namedBindings
  if (from !== "lucide-react" || !named || !ts.isNamedImports(named)) return []
  return named.elements
    .map((el): [string, ts.Node] => [(el.propertyName ?? el.name).text, el])
    .filter(([name]) => SPARKLE_IMPORT.test(name))
}

/**
 * Forbidden glyphs and emoji in the string literals and JSX text of one
 * source file, a lone symbol as a JSX element's whole content, and Lucide's
 * sparkle imports (comments are not scanned: a comment may name what it bans).
 */
export function glyphFindings(source: string, file: string): GlyphFinding[] {
  const sf = parseSource(source, file)
  const findings: GlyphFinding[] = []
  walkNodes(sf, (node) => {
    for (const [glyph, at] of sparkleImports(node)) {
      findings.push({ file, line: lineOf(sf, at), glyph, text: node.getText(sf).slice(0, 80) })
    }
    const text = literalText(node) ?? (ts.isJsxText(node) ? node.text : undefined)
    if (text === undefined) return
    const glyph = offendingGlyph(text) ?? loneSymbolIcon(node, text)
    if (glyph)
      findings.push({ file, line: lineOf(sf, node), glyph, text: text.trim().slice(0, 80) })
  })
  return findings
}

/**
 * Scan every `.ts`/`.tsx` source under `dir` (tests and declarations
 * excluded). Point it at a package's widget and message-catalog folders;
 * findings carry "/"-separated paths relative to `dir`.
 */
export function scanGlyphs(dir: string): GlyphFinding[] {
  return sourceFiles(dir).flatMap((path) =>
    glyphFindings(readFileSync(path, "utf8"), relativePath(dir, path)),
  )
}
