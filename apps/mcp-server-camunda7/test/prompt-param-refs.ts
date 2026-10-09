import ts from "typescript"

/**
 * Parameter names a source text QUOTES for a tool it names (#329) — the
 * Ask-AI / hand-off prompts, model-facing summaries and tool descriptions
 * tell the model which filters to pass, and a name the tool does not take
 * used to be stripped silently, turning a "filtered" answer engine-wide.
 *
 * Recognized quoting forms, directly after a `<module>_…` tool name:
 *   - an argument list — `tool(a=1, b="x")`, `tool({ a: 1, b })`,
 *     `tool (a 1)`, `` `tool` tool (a "x") ``: every top-level entry's
 *     leading identifier is a parameter (so prose in those parentheses is
 *     read as arguments too — keep it out of them);
 *   - prose — `tool with a=…`, `tool for processDefinitionKey …`,
 *     `tool filtered by activityId …`: the identifier after the connector,
 *     when it is followed by `=`/`:` or is camelCase.
 *
 * String concatenations (`"…tool(" + "{ a: 1 })"`) are read as ONE text;
 * every `${…}` / non-literal operand becomes a placeholder.
 */

export interface ParamRef {
  tool: string
  param: string
  /** Repo-relative `file:line`. */
  at: string
}

const PLACEHOLDER = "\u0000"

function isPlus(node: ts.Node): node is ts.BinaryExpression {
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken
}

function isStringish(node: ts.Node): boolean {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node)
  )
}

/** A `+` chain that joins at least one string literal — a concatenated text. */
function isConcat(node: ts.Node): node is ts.BinaryExpression {
  if (!isPlus(node)) return false
  const hasText = (n: ts.Node): boolean =>
    isStringish(n) || (isPlus(n) && (hasText(n.left) || hasText(n.right)))
  return hasText(node)
}

/** The literal text of a string-ish node or concat; embedded expressions are collected. */
function flatten(node: ts.Node, embedded: ts.Node[]): string {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.reduce((text, span) => {
      embedded.push(span.expression)
      return text + PLACEHOLDER + span.literal.text
    }, node.head.text)
  }
  if (isPlus(node)) return flatten(node.left, embedded) + flatten(node.right, embedded)
  embedded.push(node)
  return PLACEHOLDER
}

const QUOTE_OPENS = /['"`]/

/** Content between the paren at `open` and its match; null when it never closes. */
function balanced(text: string, open: number): string | null {
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    // An apostrophe inside a word ("instance's") is prose, not a quote.
    if (QUOTE_OPENS.test(ch) && !/[A-Za-z]/.test(text[i - 1] ?? "")) quote = ch
    else if (ch === "(") depth++
    else if (ch === ")" && --depth === 0) return text.slice(open + 1, i)
  }
  return null
}

/** Splits on top-level commas (outside brackets and quotes). */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === quote) quote = null
    } else if (QUOTE_OPENS.test(ch) && !/[A-Za-z]/.test(text[i - 1] ?? "")) quote = ch
    else if ("([{".includes(ch)) depth++
    else if (")]}".includes(ch)) depth--
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

/** The leading parameter name of each entry of an argument list. */
export function argumentNames(list: string): string[] {
  let body = list.trim()
  if (body.startsWith("{") && body.endsWith("}")) body = body.slice(1, -1)
  return splitTopLevel(body).flatMap((part) => {
    const entry = part.replaceAll(PLACEHOLDER, " ").trim()
    if (entry === "") return []
    const named = /^([A-Za-z_$][\w$]*)(?:\s*[:=]|\s|$)/.exec(entry)
    // A positional value or prose is still reported — as the name the model reads.
    return [named ? named[1] : entry.split(/\s+/)[0]]
  })
}

const CALL = /^`?(?:\s+tool)?\s*\(/
const PROSE =
  /^`?\s+(?:with|for|by|filtered (?:by|to|on)|filter (?:by|on))\s+([A-Za-z_][\w]*)(\s*[=:])?/

/** The parameter names quoted right after a tool name (`rest` = the text after it). */
export function quotedParams(rest: string): string[] {
  const call = CALL.exec(rest)
  if (call) {
    const list = balanced(rest, call[0].length - 1)
    return list === null ? [] : argumentNames(list)
  }
  const prose = PROSE.exec(rest)
  return prose && (prose[2] || /[a-z][A-Z]/.test(prose[1])) ? [prose[1]] : []
}

/** Every (tool, quoted parameter) pair in the string texts of one source file. */
export function findParamRefs(file: string, text: string, prefixes: readonly string[]): ParamRef[] {
  const toolName = new RegExp(
    `(?<![A-Za-z0-9_])(?:${prefixes.join("|")})_[a-z0-9_]+(?![A-Za-z0-9_])`,
    "g",
  )
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const refs: ParamRef[] = []
  const scan = (node: ts.Node) => {
    const embedded: ts.Node[] = []
    const content = flatten(node, embedded)
    const { line } = source.getLineAndCharacterOfPosition(node.getStart())
    for (const match of content.matchAll(toolName)) {
      const at = `${file}:${line + 1 + content.slice(0, match.index).split("\n").length - 1}`
      for (const param of quotedParams(content.slice(match.index + match[0].length))) {
        refs.push({ tool: match[0], param, at })
      }
    }
    embedded.forEach(visit)
  }
  const visit = (node: ts.Node) => {
    if (isConcat(node) || isStringish(node)) scan(node)
    else ts.forEachChild(node, visit)
  }
  visit(source)
  return refs
}
