import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { bootServer, listToolNames, type BootedServer } from "./boot-server.js"
import { findParamRefs, type ParamRef } from "./prompt-param-refs.js"

/**
 * Raw tool-name references vs the composed tool surface (#322 N187).
 *
 * Modules never import each other (CLAUDE.md invariant 8), so a widget that
 * needs another module's feed names it by raw string — the tier-2 pattern
 * (`analytics-probe.ts` → `analytics_settings_data`, `process-incidents/
 * flow.tsx` → `analytics_bpmn_heatmap_data`). Graceful degradation then
 * HIDES a stale name at runtime: the fleet view is silently never offered,
 * the heatmap overlay silently absent — and the module's own tests stub the
 * same stale literal. Only the app sees every module at once, so this is
 * where the names are checked: every `<module>_…` string literal in any
 * package's or app's non-test source must name a tool of the full surface.
 * The apps count too: the composition root hardcodes the profile feed
 * (`src/ui/main.tsx`) so the host bundle needs no build-time dependency on a
 * module's constants — and a stale name there silently falls back to English
 * and the system theme for every widget.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..")

/**
 * Source roots: apps/<app>/src, packages/core/<pkg>/src,
 * packages/connectors/<family>/<pkg>/src.
 */
function sourceRoots(): string[] {
  const dirs = (root: string) =>
    fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(root, d.name))
  const packages = path.join(REPO_ROOT, "packages")
  return [
    ...dirs(path.join(REPO_ROOT, "apps")),
    ...dirs(path.join(packages, "core")),
    ...dirs(path.join(packages, "connectors")).flatMap(dirs),
  ]
    .map((pkg) => path.join(pkg, "src"))
    .filter((src) => fs.existsSync(src))
}

const isScannedSource = (file: string) =>
  /\.tsx?$/.test(file) &&
  !/\.test\.tsx?$/.test(file) &&
  !/\.test-support\.ts$/.test(file) &&
  !file.split(path.sep).includes("generated")

interface ToolNameRef {
  name: string
  /** Repo-relative `file:line`. */
  at: string
}

/** String literals (not comments, not template expressions) shaped like a `<prefix>_…` tool name. */
function findToolNameLiterals(
  file: string,
  text: string,
  prefixes: readonly string[],
): ToolNameRef[] {
  const shape = new RegExp(`^(?:${prefixes.join("|")})_[a-z0-9_]+$`)
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const refs: ToolNameRef[] = []
  const visit = (node: ts.Node) => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      shape.test(node.text)
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart())
      refs.push({ name: node.text, at: `${file}:${line + 1}` })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return refs
}

function scanSources<T>(scan: (file: string, text: string) => T[]): T[] {
  return sourceRoots().flatMap((src) =>
    fs
      .readdirSync(src, { recursive: true, encoding: "utf8" })
      .map((rel) => path.join(src, rel))
      .filter(isScannedSource)
      .flatMap((file) => scan(path.relative(REPO_ROOT, file), fs.readFileSync(file, "utf8"))),
  )
}

describe("raw tool-name literals name real tools (full surface)", () => {
  let server: BootedServer
  let tools: Set<string>
  /** Advertised input-schema property names per tool. */
  let toolParams: Map<string, string[]>
  let refs: ToolNameRef[]
  let paramRefs: ParamRef[]

  beforeAll(async () => {
    // The full surface: every module, admin toolset, deployments, builder.
    server = await bootServer({
      authenticated: true,
      env: {
        MCP_ACTIVE_MODULES: "camunda7:admin,analytics:standard",
        CAMUNDA_ALLOW_DEPLOYMENTS: "true",
      },
    })
    const names = await listToolNames(server.client)
    tools = new Set(names)
    const { tools: listed } = await server.client.listTools()
    toolParams = new Map(
      listed.map((tool) => [tool.name, Object.keys(tool.inputSchema.properties ?? {})]),
    )
    // Module prefixes come from the surface itself: `camunda7_…`, `analytics_…`.
    const prefixes = [...new Set(names.flatMap((n) => /^([a-z0-9]+)_/.exec(n)?.[1] ?? []))]
    expect(prefixes.sort()).toEqual(["analytics", "camunda7"])
    refs = scanSources((file, text) => findToolNameLiterals(file, text, prefixes))
    paramRefs = scanSources((file, text) => findParamRefs(file, text, prefixes))
  })

  afterAll(async () => {
    await server?.close()
  })

  it("every `<module>_…` literal in app and package sources is a registered tool", () => {
    const stale = refs.filter((ref) => !tools.has(ref.name)).map((r) => `${r.name} (${r.at})`)
    expect(
      stale,
      "A source names a tool the composed server does not register — renamed or removed? " +
        "Fix the literal (a cross-module reference degrades SILENTLY at runtime).",
    ).toEqual([])
  })

  it("sees the tier-2 cross-module references (the scanner is not blind)", () => {
    const camunda7Refs = refs
      .filter((r) => r.at.startsWith("packages/connectors/camunda/camunda7-connector/src/widgets/"))
      .map((r) => r.name)
    expect(camunda7Refs).toEqual(
      expect.arrayContaining(["analytics_settings_data", "analytics_bpmn_heatmap_data"]),
    )
  })

  it("sees the composition root's hardcoded profile feed (apps are scanned too)", () => {
    const appRefs = refs
      .filter((r) => r.at.startsWith("apps/mcp-server-camunda7/src/ui/main.tsx:"))
      .map((r) => r.name)
    expect(appRefs).toContain("camunda7_user_profile_data")
  })

  // #329: a prompt that tells the model to pass a filter the tool does not
  // take used to produce a silently UNFILTERED answer; with strict inputs it
  // is a refused call. Either way the prompt is wrong — caught here.
  it("every parameter a prompt or description quotes for a tool is one that tool takes", () => {
    const wrong = paramRefs
      .filter((ref) => !toolParams.get(ref.tool)?.includes(ref.param))
      .map(
        (ref) =>
          `${ref.tool}(${ref.param}) at ${ref.at} — takes: ${
            toolParams.get(ref.tool)?.join(", ") ?? "(no such tool)"
          }`,
      )
    expect(
      wrong,
      "A source quotes a parameter the named tool does not advertise — fix the prompt " +
        "(parentheses right after a tool name are read as its arguments).",
    ).toEqual([])
  })

  it("sees the quoted parameters of the Ask-AI prompts (the scanner is not blind)", () => {
    const quoted = new Set(paramRefs.map((ref) => `${ref.tool}.${ref.param}`))
    expect([...quoted]).toEqual(
      expect.arrayContaining([
        "camunda7_list_incidents.processDefinitionKey",
        "camunda7_list_jobs.noRetriesLeft",
        "analytics_cluster_compare.deploymentTimestamp",
        "camunda7_list_process_definitions.maxResults",
      ]),
    )
    expect(paramRefs.length).toBeGreaterThanOrEqual(40)
  })
})

describe("findParamRefs", () => {
  const scan = (text: string) =>
    findParamRefs("x.ts", text, ["camunda7", "analytics"]).map((r) => `${r.tool}.${r.param}`)

  it("reads call notation: named, object, shorthand and parenthesized prose", () => {
    expect(scan('const a = `analytics_x(a="1", b=${n}) and camunda7_y({ c: 1, d })`')).toEqual([
      "analytics_x.a",
      "analytics_x.b",
      "camunda7_y.c",
      "camunda7_y.d",
    ])
    expect(scan('const a = "camunda7_y (processInstanceId 1), camunda7_z (filter by k)"')).toEqual([
      "camunda7_y.processInstanceId",
      "camunda7_z.filter",
    ])
    expect(scan('const a = "Use the `camunda7_engine` tool (action \\"list\\")"')).toEqual([
      "camunda7_engine.action",
    ])
  })

  it("joins concatenations and treats template expressions as values", () => {
    expect(
      scan('const a = "try camunda7_list_x(" + `{ maxResults: 1${e ? `, engine: "e"` : ""} })`'),
    ).toEqual(["camunda7_list_x.maxResults"])
    expect(scan("const a = `camunda7_y({${engineArg(id)}incidentId: '${id}'})`")).toEqual([
      "camunda7_y.incidentId",
    ])
  })

  it("reads prose connectors only for parameter-shaped names", () => {
    expect(
      scan(
        'const a = "camunda7_x with processDefinitionKey=k; camunda7_y for instance 1; camunda7_z with that key"',
      ),
    ).toEqual(["camunda7_x.processDefinitionKey"])
  })

  it("ignores comments, unclosed lists and possessive apostrophes", () => {
    expect(scan("// camunda7_x(bogus=1)\nconst a = 'camunda7_y(' ")).toEqual([])
    expect(scan('const a = "camunda7_x (the instance\'s incidents)"')).toEqual(["camunda7_x.the"])
  })
})

describe("findToolNameLiterals", () => {
  it("flags string literals only — comments, template expressions and other shapes pass", () => {
    const text = [
      "// the `camunda7_in_comment_data` feed",
      'const a = "camunda7_stale_data"',
      "const b = `analytics_feed_data`",
      "const c = `camunda7_${'x'}`",
      'const d = "camunda_engine_id"',
      'const e = "camunda7_Upper"',
    ].join("\n")
    expect(findToolNameLiterals("x.ts", text, ["camunda7", "analytics"])).toEqual([
      { name: "camunda7_stale_data", at: "x.ts:2" },
      { name: "analytics_feed_data", at: "x.ts:3" },
    ])
  })
})
