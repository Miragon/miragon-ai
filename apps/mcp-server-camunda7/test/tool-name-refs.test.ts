import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { bootServer, listToolNames, type BootedServer } from "./boot-server.js"

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
 * package's non-test source must name a tool of the full surface.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..")

/** Package source roots: packages/core/<pkg>/src, packages/connectors/<family>/<pkg>/src. */
function packageSourceRoots(): string[] {
  const dirs = (root: string) =>
    fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(root, d.name))
  const packages = path.join(REPO_ROOT, "packages")
  return [
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

function scanPackages(prefixes: readonly string[]): ToolNameRef[] {
  return packageSourceRoots().flatMap((src) =>
    fs
      .readdirSync(src, { recursive: true, encoding: "utf8" })
      .map((rel) => path.join(src, rel))
      .filter(isScannedSource)
      .flatMap((file) =>
        findToolNameLiterals(
          path.relative(REPO_ROOT, file),
          fs.readFileSync(file, "utf8"),
          prefixes,
        ),
      ),
  )
}

describe("raw tool-name literals name real tools (full surface)", () => {
  let server: BootedServer
  let tools: Set<string>
  let refs: ToolNameRef[]

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
    // Module prefixes come from the surface itself: `camunda7_…`, `analytics_…`.
    const prefixes = [...new Set(names.flatMap((n) => /^([a-z0-9]+)_/.exec(n)?.[1] ?? []))]
    expect(prefixes.sort()).toEqual(["analytics", "camunda7"])
    refs = scanPackages(prefixes)
  })

  afterAll(async () => {
    await server?.close()
  })

  it("every `<module>_…` literal in package sources is a registered tool", () => {
    const stale = refs.filter((ref) => !tools.has(ref.name)).map((r) => `${r.name} (${r.at})`)
    expect(
      stale,
      "A package names a tool the composed server does not register — renamed or removed? " +
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
