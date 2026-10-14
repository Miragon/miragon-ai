import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { EXPECTED_TOOLS_ADMIN } from "./expected-tools.js"
import { REPO_ROOT } from "./source-scan.js"

/**
 * Docs and skills say what the code does (#345). A skill an agent follows
 * writes the code it shows, so a stale name there lands in the next change.
 * This guard reads every backticked reference in the docs, the READMEs and
 * the skills and checks it against the repo: tool names against the full
 * surface, repo paths against the tree, the skills' identifiers against the
 * sources and the toolkit/mcp-use typings, and each page in docs/ against its
 * line budget (DOCS_BUDGETS below).
 *
 * The product page https://miragon.ai/tools/pulse/ is built from
 * Miragon/miragon-ai-docs, which checks its own tool names against this repo
 * (scripts/check-miragon-ai-refs.mjs there).
 */

const TEMPLATE_ROOT = path.join(REPO_ROOT, "templates", "composed-server")

const walk = (dir: string, keep: (file: string) => boolean): string[] =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { recursive: true, encoding: "utf8" })
        .filter((rel) => !rel.split(path.sep).some((part) => part === "node_modules"))
        .map((rel) => path.join(dir, rel))
        .filter((file) => keep(file) && fs.statSync(file).isFile())
    : []

const isMarkdown = (file: string) => file.endsWith(".md")
const skillFiles = [
  ...walk(path.join(REPO_ROOT, ".claude", "skills"), (f) => f.endsWith("SKILL.md")),
  ...walk(path.join(TEMPLATE_ROOT, ".claude", "skills"), (f) => f.endsWith("SKILL.md")),
]
const docFiles = [
  path.join(REPO_ROOT, "README.md"),
  path.join(REPO_ROOT, "CLAUDE.md"),
  ...walk(path.join(REPO_ROOT, "docs"), isMarkdown),
  ...walk(path.join(REPO_ROOT, "packages"), (f) => f.endsWith("README.md")),
  path.join(TEMPLATE_ROOT, "README.md"),
  path.join(TEMPLATE_ROOT, "CLAUDE.md"),
  ...skillFiles,
]

interface Ref {
  file: string
  line: number
  token: string
}

/** Every inline-code token (`…`) with its file and line; fenced blocks are code, read separately. */
function backticked(file: string): Ref[] {
  const refs: Ref[] = []
  let fenced = false
  fs.readFileSync(file, "utf8")
    .split("\n")
    .forEach((text, index) => {
      if (/^\s*```/.test(text)) fenced = !fenced
      if (fenced) return
      for (const match of text.matchAll(/`([^`\n]+)`/g)) {
        refs.push({ file: path.relative(REPO_ROOT, file), line: index + 1, token: match[1] ?? "" })
      }
    })
  return refs
}

const where = (ref: Ref) => `${ref.file}:${ref.line} \`${ref.token}\``

describe("tool names in the docs", () => {
  const tools = new Set(EXPECTED_TOOLS_ADMIN)
  // A short form (`show_process_list`, `bpmn_heatmap_data`) names the module's tool.
  const known = (name: string) =>
    tools.has(name) || tools.has(`camunda7_${name}`) || tools.has(`analytics_${name}`)
  const looksLikeTool = (token: string) =>
    /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(token) &&
    (/^(?:camunda7|analytics)_/.test(token) ||
      /(?:^|_)show_/.test(token) ||
      token.endsWith("_data"))

  // The template's docs also name its own module's tools (`notes_show_notes`),
  // which its own suite checks; here only the shipped modules' names count.
  const checked = (ref: Ref) =>
    ref.file.startsWith("templates/") ? /^(?:camunda7|analytics)_/.test(ref.token) : true

  it("names only tools the server registers", () => {
    const stale = docFiles
      .flatMap(backticked)
      .filter((ref) => looksLikeTool(ref.token) && checked(ref) && !known(ref.token))
    expect(stale.map(where)).toEqual([])
  })
})

describe("repo paths in the docs", () => {
  const ROOTS =
    /^(?:apps|packages|docs|scripts|playground|engine-plugins|templates|\.claude|\.github)\//
  // Written by a build or a test run, not checked in.
  const GENERATED = /(?:^|\/)(?:dist|test-results|node_modules|generated-sources)(?:\/|$)/
  const pathOf = (token: string) => token.replace(/:\d+(?:-\d+)?$/, "").replace(/\/$/, "")
  const isPath = (token: string) =>
    ROOTS.test(token) && !/\.\.\.|[*<>{}\s|]/.test(token) && !GENERATED.test(token)

  it("cites only files and directories that exist", () => {
    const missing = docFiles
      .flatMap(backticked)
      .filter((ref) => isPath(ref.token))
      .filter((ref) => {
        const target = pathOf(ref.token)
        // The template's own docs cite paths inside the template first.
        const fromTemplate = ref.file.startsWith("templates/composed-server/")
        return !(
          fs.existsSync(path.join(REPO_ROOT, target)) ||
          (fromTemplate && fs.existsSync(path.join(TEMPLATE_ROOT, target)))
        )
      })
    expect(missing.map(where)).toEqual([])
  })
})

describe("identifiers in the skills", () => {
  // The app's own copies: the versions the skills' code compiles against.
  const packageDir = (name: string) =>
    fs.realpathSync(path.join(import.meta.dirname, "..", "node_modules", name))
  const isSource = (file: string) => /\.(?:tsx?|mts|mjs|cjs|kt)$/.test(file)
  const corpus = [
    ...["apps", "packages", "scripts", "templates", "engine-plugins"].flatMap((dir) =>
      walk(path.join(REPO_ROOT, dir), isSource),
    ),
    ...["@miragon/mcp-toolkit-core", "@miragon/mcp-toolkit-ui", "mcp-use"].flatMap((name) =>
      walk(path.join(packageDir(name), "dist"), (file) => file.endsWith(".d.ts")),
    ),
  ]
  const words = new Set(
    corpus.flatMap((file) => fs.readFileSync(file, "utf8").match(/[A-Za-z_$][\w$]*/g) ?? []),
  )
  // A camelCase or PascalCase name, optionally called: `useResetOnChange(…)`.
  const identifierOf = (token: string) =>
    /^([a-z]+[A-Z]\w*|[A-Z][a-z]+[A-Z]\w*)(?:\(.*\))?$/.exec(token)?.[1]
  // Names a skill invents for the reader's own code.
  const PLACEHOLDER = /Xyz|Your[A-Z]|My[A-Z]|^my[A-Z]|Foo|Example/
  // Skills that teach no code of this repo: shadcn's is vendored (its own
  // components and CLI), create-ticket names the agent's tools.
  const NOT_REPO_CODE = new Set(["shadcn", "create-ticket"])
  const teachesRepoCode = (file: string) => !NOT_REPO_CODE.has(path.basename(path.dirname(file)))

  it("name only functions, hooks and types that exist", () => {
    const unknown = skillFiles
      .filter(teachesRepoCode)
      .flatMap(backticked)
      .filter((ref) => {
        const name = identifierOf(ref.token)
        return name !== undefined && !PLACEHOLDER.test(name) && !words.has(name)
      })
    expect(unknown.map(where)).toEqual([])
  })
})

/** The pages in docs/ and their line budgets: a page that outgrows its budget condenses. */
const DOCS_BUDGETS: Record<string, number> = {
  "README.md": 40,
  "getting-started.md": 60,
  "architecture.md": 150,
  "developer.md": 80,
  "operations.md": 120,
  "usage.md": 150,
}

describe("docs page budgets", () => {
  it("every page in docs/ has a budget", () => {
    expect(
      walk(path.join(REPO_ROOT, "docs"), isMarkdown)
        .map((f) => path.basename(f))
        .sort(),
    ).toEqual(Object.keys(DOCS_BUDGETS).sort())
  })

  it.each(Object.entries(DOCS_BUDGETS))("%s stays within %i lines", (page, lines) => {
    const text = fs.readFileSync(path.join(REPO_ROOT, "docs", page), "utf8")
    expect(text.replace(/\n$/, "").split("\n").length).toBeLessThanOrEqual(lines)
  })
})
