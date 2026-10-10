import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { beforeAll, describe, expect, it, vi } from "vitest"
import type { MCPServer } from "mcp-use"
import { createPlugin } from "./plugin.js"
import {
  CAMUNDA7_SAVE_USER_PROFILE,
  CAMUNDA7_USER_PROFILE_DATA,
  CAMUNDA7_WIDGET_ACTIONS,
} from "./tool-names.js"
import { GATING_SITES } from "./widgets/action-gating.sites.js"
import { WRITE_POLICY } from "./widgets/lib/write-policy.js"

// Lives outside `src/widgets` on purpose: the widget tsconfig is browser-only
// (no Node types), and this guard reads the widget sources from disk.
const SRC_DIR = fileURLToPath(new URL("./", import.meta.url))
const WIDGETS_DIR = join(SRC_DIR, "widgets")

/** THE in-widget write primitive — the one file allowed to hold a raw mutation and the gate. */
const PRIMITIVE = "lib/engine-action.ts"

/** How widget code can name a tool it calls. */
type Via = "action" | "mutation" | "callTool" | "read"

interface ToolReference {
  file: string
  line: number
  via: Via
  /** The tool's name, or null when the expression is not a literal or a string constant. */
  name: string | null
}

interface WidgetScan {
  references: ToolReference[]
  /** Files importing the toolkit's raw `useToolMutation`. */
  mutationImports: string[]
  /** Files calling the deployment gate directly. */
  canRunCalls: string[]
  /** String literals that open an array (the first segment of a query key). */
  keyRoots: Set<string>
}

/** A file's top-level `const NAME = "value"` declarations. */
function stringConstants(source: ts.SourceFile): Map<string, string> {
  const constants = new Map<string, string>()
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer && ts.isStringLiteral(decl.initializer)) {
        constants.set(decl.name.text, decl.initializer.text)
      }
    }
  }
  return constants
}

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true)
}

function widgetFiles(): string[] {
  return readdirSync(WIDGETS_DIR, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test(-support)?\.tsx?$/.test(f))
    .map((f) => f.split("\\").join("/"))
}

/** Which positional argument of which call names the tool it calls. */
const POSITIONAL_TOOL_ARG = new Map<string, { via: Via; index: number }>([
  ["useToolMutation", { via: "mutation", index: 0 }],
  ["callTool", { via: "callTool", index: 0 }],
  ["useToolQuery", { via: "read", index: 1 }],
  ["useViewToolQuery", { via: "read", index: 1 }],
  ["useSeededToolQuery", { via: "read", index: 1 }],
  ["useViewData", { via: "read", index: 2 }],
])

function calleeName(call: ts.CallExpression): string | null {
  const callee = call.expression
  if (ts.isIdentifier(callee)) return callee.text
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text
  return null
}

/**
 * The call's positional tool argument. Any other `*CallTool(…)` (a held
 * `useCallTool()` result) counts as a raw call too.
 */
function positionalTool(call: ts.CallExpression): { via: Via; arg: ts.Expression } | null {
  const name = calleeName(call)
  if (name === null) return null
  const known =
    POSITIONAL_TOOL_ARG.get(name) ??
    (/callTool$/i.test(name) && name !== "useCallTool"
      ? { via: "callTool" as const, index: 0 }
      : null)
  const arg = known ? call.arguments[known.index] : undefined
  return known && arg ? { via: known.via, arg } : null
}

/**
 * A `{ tool: … }` option — of `useEngineAction` (the write) or of a read
 * hook (`useDetailView`, `usePagedViewData`, …).
 */
function toolOption(node: ts.Node): { via: Via; arg: ts.Expression } | null {
  if (!ts.isPropertyAssignment(node) || !ts.isIdentifier(node.name)) return null
  if (node.name.text !== "tool") return null
  const call = node.parent.parent
  const action = ts.isCallExpression(call) && calleeName(call) === "useEngineAction"
  return { via: action ? "action" : "read", arg: node.initializer }
}

function importsRawMutation(node: ts.Node): boolean {
  if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return false
  if (!node.moduleSpecifier.text.startsWith("@miragon/mcp-toolkit-ui")) return false
  const bindings = node.importClause?.namedBindings
  return (
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.some((e) => (e.propertyName ?? e.name).text === "useToolMutation")
  )
}

function scanFile(file: string, toolNames: Map<string, string>, scan: WidgetScan): void {
  const source = parse(join(WIDGETS_DIR, file))
  // How widgets name tools: the tool-names.ts constants, or a constant of their own file.
  const constants = new Map([...toolNames, ...stringConstants(source)])
  const nameOf = (expr: ts.Expression): string | null => {
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text
    return ts.isIdentifier(expr) ? (constants.get(expr.text) ?? null) : null
  }
  const record = (at: ts.Node, ref: { via: Via; arg: ts.Expression }) => {
    const { line } = source.getLineAndCharacterOfPosition(at.getStart(source))
    scan.references.push({ file, line: line + 1, via: ref.via, name: nameOf(ref.arg) })
  }
  const visit = (node: ts.Node) => {
    if (importsRawMutation(node)) scan.mutationImports.push(file)
    if (ts.isCallExpression(node)) {
      if (calleeName(node) === "useCanRun") scan.canRunCalls.push(file)
      const ref = positionalTool(node)
      if (ref) record(node, ref)
    }
    const option = toolOption(node)
    if (option) record(node, option)
    if (
      ts.isArrayLiteralExpression(node) &&
      node.elements[0] &&
      ts.isStringLiteral(node.elements[0])
    ) {
      scan.keyRoots.add(node.elements[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

function scanWidgets(): WidgetScan {
  const toolNames = stringConstants(parse(join(SRC_DIR, "tool-names.ts")))
  const scan: WidgetScan = {
    references: [],
    mutationImports: [],
    canRunCalls: [],
    keyRoots: new Set(),
  }
  for (const file of widgetFiles()) scanFile(file, toolNames, scan)
  return scan
}

/** Every tool the plugin registers on the widest toolset, with its read/write nature. */
function registeredTools(): Map<string, { readOnly: boolean }> {
  const register = vi.fn()
  const server = { tool: register, use: vi.fn(), prompt: vi.fn() } as unknown as MCPServer
  const plugin = createPlugin({
    engines: [{ id: "prod", baseUrl: "http://prod.example/engine-rest" }],
    toolset: "admin",
  })
  plugin.registerTools?.(server)
  plugin.registerWidgetTools?.(server)
  const definitions = register.mock.calls.map(
    ([definition]) => definition as { name: string; annotations?: { readOnlyHint?: boolean } },
  )
  return new Map(
    definitions.map((d) => [d.name, { readOnly: d.annotations?.readOnlyHint === true }]),
  )
}

let scan: WidgetScan
let registered: Map<string, { readOnly: boolean }>
beforeAll(() => {
  scan = scanWidgets()
  registered = registeredTools()
})

const at = (ref: ToolReference) => `${ref.file}:${ref.line}`
const isWrite = (name: string | null) => name !== null && registered.get(name)?.readOnly === false
const actionRefs = () => scan.references.filter((r) => r.via === "action")

/**
 * #341 / N185 — the in-widget write path, structurally. Every widget write
 * goes through `useEngineAction` (src/widgets/lib/engine-action.ts), which
 * carries the deployment gate, the confirmation, the targeted refresh and the
 * optimistic-state reset in ONE place. A write that bypasses it — a raw
 * mutation, a `callTool` of a write tool, a gate read on its own — could skip
 * any of them, so the sources may not contain one. `action-gating.test.tsx`
 * renders every call site this scan finds against a feed that excludes it.
 */
describe("every in-widget write goes through useEngineAction", () => {
  it("finds the widgets' tool calls and classifies them (the scan is not vacuous)", () => {
    expect(actionRefs().length).toBeGreaterThanOrEqual(CAMUNDA7_WIDGET_ACTIONS.length)
    expect(scan.references.some((r) => r.via === "read")).toBe(true)
    expect(registered.get("camunda7_set_job_retries")?.readOnly).toBe(false)
    expect(registered.get("camunda7_jobs_data")?.readOnly).toBe(true)
  })

  it("only the primitive holds the toolkit's raw mutation and the deployment gate", () => {
    expect(scan.mutationImports).toEqual([PRIMITIVE])
    expect(scan.canRunCalls).toEqual([PRIMITIVE])
  })

  it("names every tool it calls literally (a string or a string constant)", () => {
    const dynamic = scan.references.filter((r) => r.name === null && r.file !== PRIMITIVE)
    expect(
      dynamic.map(at),
      "pass the tool name as a literal or a string constant, so this guard can classify it",
    ).toEqual([])
  })

  it("never calls a write tool except through useEngineAction", () => {
    const bypasses = scan.references.filter((r) => r.via !== "action" && isWrite(r.name))
    expect(
      bypasses.map((r) => `${at(r)} ${r.via}(${r.name})`),
      "run the write through useEngineAction — it gates, confirms, refreshes and resets",
    ).toEqual([])
  })

  it("runs only registered writes, each one listed in CAMUNDA7_WIDGET_ACTIONS (or self-gated)", () => {
    const listed = new Set<string>([...CAMUNDA7_WIDGET_ACTIONS, CAMUNDA7_SAVE_USER_PROFILE])
    for (const ref of actionRefs()) {
      expect(isWrite(ref.name), `${at(ref)}: ${ref.name} is not a registered write`).toBe(true)
      expect(
        listed.has(ref.name ?? ""),
        `${at(ref)}: add ${ref.name} to CAMUNDA7_WIDGET_ACTIONS (tool-names.ts) — the feed gates only listed writes`,
      ).toBe(true)
    }
  })

  it("leaves no listed widget action unused", () => {
    const used = new Set(actionRefs().map((r) => r.name))
    for (const action of CAMUNDA7_WIDGET_ACTIONS) {
      expect(used.has(action), `${action} is listed but no widget runs it`).toBe(true)
    }
  })

  it("has a render-level gating case for every call site", () => {
    const sites = new Set(actionRefs().map((r) => `${r.file}#${r.name}`))
    expect(new Set(GATING_SITES.map((entry) => entry.site))).toEqual(sites)
  })

  it("invalidates only query namespaces some view actually uses", () => {
    // The app root's profile gate derives its key from the feed name (widget-shell ProfileGate).
    const roots = new Set([
      ...scan.keyRoots,
      `${CAMUNDA7_USER_PROFILE_DATA.split("_")[0]}:profile-gate`,
    ])
    for (const [write, policy] of Object.entries(WRITE_POLICY)) {
      for (const namespace of policy.invalidates) {
        expect(roots.has(namespace), `${write} invalidates ${namespace}, which no query uses`).toBe(
          true,
        )
      }
    }
  })
})
