import ts from "typescript"

/**
 * Source readers for the hand-off guard (#338). Every Ask-AI prompt and model
 * context is assembled by widget-shell's `askAiPrompt`/`modelContextText` from
 * a typed spec — an object literal with an `intent` (hand-off) or `summary`
 * (view context) next to its `ids` and the `tools` it may name. These readers
 * find those specs and every way around the primitive, so the guard can check
 * them against the booted server.
 */

export interface HandOffSpec {
  kind: "hand-off" | "context"
  /** Repo-relative `file:line`. */
  at: string
  /** The tool names, or null when the list is not written literally. */
  tools: string[] | null
  /** The `ids` keys, or null when the object is not written literally. */
  ids: string[] | null
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart()).line + 1
}

function propertyName(node: ts.ObjectLiteralElementLike): string | null {
  if (!node.name) return null
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text
  return null
}

/** `[...]` or `[...].filter(...)` of string literals → the names; anything else → null. */
function literalToolList(expr: ts.Expression): string[] | null {
  let list: ts.Expression = expr
  if (
    ts.isCallExpression(list) &&
    ts.isPropertyAccessExpression(list.expression) &&
    list.expression.name.text === "filter"
  ) {
    list = list.expression.expression
  }
  if (!ts.isArrayLiteralExpression(list)) return null
  const names = list.elements.map((element) =>
    ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element)
      ? element.text
      : null,
  )
  return names.every((name) => name !== null) ? names : null
}

/** The keys of an `ids: { … }` literal (shorthand included); null for a spread or non-literal. */
function literalKeys(expr: ts.Expression): string[] | null {
  if (!ts.isObjectLiteralExpression(expr)) return null
  const keys = expr.properties.map(propertyName)
  return keys.every((key) => key !== null) ? keys : null
}

/** Every hand-off / view-context spec (an object literal with `tools` and `intent`/`summary`). */
export function findHandOffSpecs(file: string, text: string): HandOffSpec[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const specs: HandOffSpec[] = []
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const props = new Map(
        node.properties.flatMap((p) => {
          const name = propertyName(p)
          return name !== null && ts.isPropertyAssignment(p) ? [[name, p.initializer] as const] : []
        }),
      )
      const names = new Set(node.properties.map(propertyName))
      const kind = names.has("intent") ? "hand-off" : names.has("summary") ? "context" : null
      const tools = props.get("tools")
      if (kind && names.has("tools")) {
        const ids = props.get("ids")
        specs.push({
          kind,
          at: `${file}:${lineOf(source, node)}`,
          tools: tools ? literalToolList(tools) : null,
          ids: ids ? literalKeys(ids) : names.has("ids") ? null : [],
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return specs
}

export interface SourceRef {
  name: string
  /** Repo-relative `file:line`. */
  at: string
}

/**
 * Every identifier named `names` — calls, property accesses, imports and
 * destructurings alike (comments and strings are not identifiers).
 */
export function findIdentifiers(
  file: string,
  text: string,
  names: ReadonlySet<string>,
): SourceRef[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const refs: SourceRef[] = []
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && names.has(node.text)) {
      refs.push({ name: node.text, at: `${file}:${lineOf(source, node)}` })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return refs
}

/**
 * The value of every `<HostModelContext content={…}>`: the callee's name when
 * it is a call, else `null` (a literal, template or concatenation written in
 * place).
 */
export function findModelContextContents(
  file: string,
  text: string,
): Array<SourceRef & { callee: string | null }> {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const found: Array<SourceRef & { callee: string | null }> = []
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(source) === "HostModelContext"
    ) {
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr) || attr.name.getText(source) !== "content") continue
        const expr =
          attr.initializer && ts.isJsxExpression(attr.initializer)
            ? attr.initializer.expression
            : undefined
        const callee =
          expr && ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)
            ? expr.expression.text
            : null
        found.push({ name: "content", at: `${file}:${lineOf(source, attr)}`, callee })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/**
 * Every `<module>_…` tool name inside a server-instructions text — a family
 * wildcard (`camunda7_show_*`) names no single tool and is skipped.
 */
export function toolNamesIn(text: string, prefixes: readonly string[]): string[] {
  const shape = new RegExp(
    `(?<![A-Za-z0-9_])(?:${prefixes.join("|")})_[a-z0-9_]*[a-z0-9](?![A-Za-z0-9_*])`,
    "g",
  )
  return [...new Set(text.match(shape) ?? [])]
}

/**
 * Tool names inside PROSE — a string or template text with whitespace in it,
 * i.e. something a model reads (a prompt, a description, a summary), never a
 * bare identifier like a feed constant.
 */
export function findProseToolNames(
  file: string,
  text: string,
  prefixes: readonly string[],
): SourceRef[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const refs: SourceRef[] = []
  const check = (node: ts.Node, prose: string) => {
    if (!/\s/.test(prose)) return
    for (const name of toolNamesIn(prose, prefixes)) {
      refs.push({ name, at: `${file}:${lineOf(source, node)}` })
    }
  }
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      check(node, node.text)
    } else if (ts.isTemplateExpression(node)) {
      check(
        node,
        [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" "),
      )
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return refs
}
