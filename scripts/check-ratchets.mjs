#!/usr/bin/env node
/**
 * Ratchet self-protection — ported from mcp-toolkit's scripts/check-ratchets.mjs
 * (FITNESS.md phase 2b) and adapted to where this repo keeps its ratchets.
 *
 * The fastest way to turn a red gate green is to loosen the gate in the same
 * diff — a rule-shaped edit nobody reads as a regression. This check compares
 * every ratchet against the MERGE BASE of the target branch (never against
 * the PR's own files) and fails on any move in the forbidden direction:
 *
 *   <pkg>/vitest.config.ts          coverage thresholds raise-only, never removed;
 *   vitest.shared.ts                coverage `exclude` shrink-only; `enabled`
 *                                   never switched off
 *   <pkg>/stryker.config.json       thresholds.break raise-only; `mutate`
 *                                   grow-only (an entry may leave only when
 *                                   break rises in the same diff, or when it
 *                                   names a file that no longer exists);
 *                                   mutator.excludedMutations shrink-only
 *   eslint.config.mjs               complexityRatchet / maxLinesRatchet
 *                                   shrink-only (no new entry, no raised value);
 *                                   the global complexity / max-lines budgets
 *                                   never raised or removed; no new override
 *                                   of either rule; `ignores` shrink-only
 *   knip.jsonc                      every ignore list shrink-only
 *   apps/<app>/test/__golden__/char-budgets.json
 *                                   model-visible tool-surface budgets
 *                                   shrink-only, never removed
 *   package.json (root)             no gate drops out of `lint`/`test`;
 *                                   `lint:deadcode --exclude` shrink-only
 *
 * The SINGLE documented escape is a commit trailer in the branch range:
 *
 *   Ratchet-Exception: <reason>
 *
 * which downgrades the failures to loud warnings (CODEOWNERS review still
 * applies to every PR). There is no other bypass.
 *
 * Run: node scripts/check-ratchets.mjs [baseRef]   (`pnpm lint:ratchets`;
 * default origin/$GITHUB_BASE_REF in CI, else origin/main; CI needs
 * fetch-depth: 0). The working tree is the "new" side, so uncommitted
 * loosening fails locally too.
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export const EXCEPTION_TRAILER = /^Ratchet-Exception: .+/m

const PKG = String.raw`(?:apps/[^/]+|packages/core/[^/]+|packages/connectors/[^/]+/[^/]+)`

/** Which ratchet a repo-relative path carries, or null when it carries none. */
export function ratchetKind(relPath) {
  if (relPath === "vitest.shared.ts" || new RegExp(`^${PKG}/vitest\\.config\\.ts$`).test(relPath))
    return "vitest"
  if (new RegExp(`^${PKG}/stryker\\.config\\.json$`).test(relPath)) return "stryker"
  if (relPath === "eslint.config.mjs") return "eslint"
  if (relPath === "knip.jsonc" || relPath === "knip.json") return "knip"
  if (/^apps\/[^/]+\/test\/__golden__\/char-budgets\.json$/.test(relPath)) return "char-budgets"
  if (relPath === "package.json") return "root-scripts"
  return null
}

// ── Source extraction (TypeScript AST — no evaluation, no imports) ──────────

/** Whitespace- and trailing-comma-insensitive source text: prettier-stable keys. */
const normalize = (text) => text.replace(/\s+/g, "").replace(/,([\]}])/g, "$1")

function parseSource(relPath, text) {
  const kind = relPath.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS
  return ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, kind)
}

function propName(name) {
  if (
    name &&
    (ts.isIdentifier(name) ||
      ts.isStringLiteral(name) ||
      ts.isNumericLiteral(name) ||
      ts.isNoSubstitutionTemplateLiteral(name))
  )
    return name.text
  return undefined
}

function walk(node, visit) {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

/** A literal's value: number (incl. negative), string or boolean; undefined otherwise. */
function literalValue(node) {
  if (!node) return undefined
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  )
    return -Number(node.operand.text)
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  return undefined
}

/** Array-literal elements as comparable strings: literal values, else normalized source. */
function arrayEntries(node) {
  if (!ts.isArrayLiteralExpression(node)) return null
  return node.elements.map((element) => {
    const value = literalValue(element)
    return typeof value === "string" ? value : normalize(element.getText())
  })
}

const COVERAGE_METRICS = ["statements", "branches", "functions", "lines"]

/**
 * The coverage ratchet of a vitest config: `{ thresholds, exclude, enabled,
 * opaque }`, or `{ error }` when the file cannot be read unambiguously (the
 * comparison then fails closed).
 */
export function extractVitestCoverage(relPath, text) {
  const blocks = []
  walk(parseSource(relPath, text), (node) => {
    if (ts.isPropertyAssignment(node) && propName(node.name) === "coverage") blocks.push(node)
  })
  const result = { thresholds: null, exclude: [], enabled: undefined, opaque: [] }
  if (blocks.length === 0) return result
  if (blocks.length > 1)
    return { error: `${blocks.length} \`coverage\` blocks — the ratchet needs exactly one` }
  const coverage = blocks[0].initializer
  if (!ts.isObjectLiteralExpression(coverage))
    return { error: "`coverage` is not an object literal — the ratchet cannot read it" }
  for (const prop of coverage.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      // A spread or shorthand could carry thresholds/exclude the AST cannot see.
      result.opaque.push(normalize(prop.getText()))
      continue
    }
    const name = propName(prop.name)
    if (name === "thresholds") {
      result.thresholds = {}
      if (!ts.isObjectLiteralExpression(prop.initializer)) continue
      for (const metric of prop.initializer.properties) {
        const key = ts.isPropertyAssignment(metric) ? propName(metric.name) : undefined
        if (key && COVERAGE_METRICS.includes(key)) {
          const value = literalValue(metric.initializer)
          if (typeof value === "number") result.thresholds[key] = value
        }
      }
    } else if (name === "exclude") {
      result.exclude = arrayEntries(prop.initializer) ?? [normalize(prop.initializer.getText())]
    } else if (name === "enabled") {
      const value = literalValue(prop.initializer)
      result.enabled = typeof value === "boolean" ? value : normalize(prop.initializer.getText())
    }
  }
  return result
}

const BUDGET_RULES = ["complexity", "max-lines"]
const RATCHET_MAPS = ["complexityRatchet", "maxLinesRatchet"]
const LAX_SEVERITIES = new Set(["off", "warn", 0, 1])

/**
 * The ESLint ratchets of eslint.config.mjs:
 * - `maps`: the exported debt maps (file → frozen value);
 * - `budgets`: every complexity/max-lines rule setting, keyed by
 *   rule + `files` + value shape (numbers masked), with its numeric values
 *   and whether it is a budget ("error") or an exemption ("off"/"warn");
 * - `ignores`: every entry of every `ignores` array.
 */
export function extractEslintRatchets(relPath, text) {
  const sourceFile = parseSource(relPath, text)
  const maps = {}
  const errors = []
  const budgets = {}
  const ignores = []

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const decl of statement.declarationList.declarations) {
      const name = ts.isIdentifier(decl.name) ? decl.name.text : undefined
      if (!RATCHET_MAPS.includes(name)) continue
      if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) {
        errors.push(`${name} is not an object literal — the ratchet cannot read it`)
        continue
      }
      maps[name] = {}
      for (const prop of decl.initializer.properties) {
        const key = ts.isPropertyAssignment(prop) ? propName(prop.name) : undefined
        const value = key ? literalValue(prop.initializer) : undefined
        if (key === undefined || typeof value !== "number") {
          errors.push(`${name}: entry \`${normalize(prop.getText())}\` is not "file": <number>`)
          continue
        }
        maps[name][key] = value
      }
    }
  }

  walk(sourceFile, (node) => {
    if (!ts.isPropertyAssignment(node)) return
    const name = propName(node.name)
    if (name === "ignores") {
      ignores.push(...(arrayEntries(node.initializer) ?? [normalize(node.initializer.getText())]))
    }
    if (name !== "rules" || !ts.isObjectLiteralExpression(node.initializer)) return
    const block = node.parent
    const filesProp = ts.isObjectLiteralExpression(block)
      ? block.properties.find((p) => ts.isPropertyAssignment(p) && propName(p.name) === "files")
      : undefined
    const files = filesProp ? normalize(filesProp.initializer.getText()) : "<all files>"
    for (const rule of node.initializer.properties) {
      const ruleName = ts.isPropertyAssignment(rule) ? propName(rule.name) : undefined
      if (!BUDGET_RULES.includes(ruleName)) continue
      const valueText = normalize(rule.initializer.getText())
      const severityNode = ts.isArrayLiteralExpression(rule.initializer)
        ? rule.initializer.elements[0]
        : rule.initializer
      const numbers = []
      walk(rule.initializer, (n) => {
        if (ts.isNumericLiteral(n) && n !== severityNode) numbers.push(Number(n.text))
      })
      const key = `${ruleName} | files ${files} | ${valueText.replace(/\d+(\.\d+)?/g, "#")}`
      budgets[key] = {
        numbers,
        exemption: LAX_SEVERITIES.has(literalValue(severityNode)),
      }
    }
  })

  return { maps, budgets, ignores, errors }
}

/** knip ignore entries, flattened to `path.key: value` strings. */
export function collectKnipIgnores(node, prefix = "", into = new Set()) {
  if (!node || typeof node !== "object") return into
  for (const [key, value] of Object.entries(node)) {
    if (/^ignore/.test(key) && Array.isArray(value)) {
      for (const item of value) into.add(`${prefix}${key}: ${String(item)}`)
    } else if (/^ignore/.test(key) && value && typeof value === "object") {
      for (const [sub, subValue] of Object.entries(value))
        into.add(`${prefix}${key}.${sub}: ${JSON.stringify(subValue)}`)
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      collectKnipIgnores(value, `${prefix}${key}.`, into)
    }
  }
  return into
}

/** JSON with comments + trailing commas (knip.jsonc); throws on a syntax error. */
export function parseJsonc(relPath, text) {
  const { config, error } = ts.parseConfigFileTextToJson(relPath, text)
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"))
  return config
}

// ── Direction policies ───────────────────────────────────────────────────────

function compareVitest(relPath, oldText, newText) {
  const old = extractVitestCoverage(relPath, oldText)
  if (old.error) return [] // unreadable on the base: nothing trustworthy to compare
  if (newText === null) {
    return old.thresholds && Object.keys(old.thresholds).length > 0
      ? [
          `${relPath} was removed while it carried coverage thresholds. Coverage floors are raise-only and never deleted.`,
        ]
      : []
  }
  const cur = extractVitestCoverage(relPath, newText)
  if (cur.error)
    return [
      `${relPath}: ${cur.error}. A ratchet the gate cannot read is a disabled ratchet — keep the literal \`coverage: { thresholds: { … } }\` shape.`,
    ]
  const violations = []
  for (const [metric, oldValue] of Object.entries(old.thresholds ?? {})) {
    const newValue = cur.thresholds?.[metric]
    if (typeof newValue !== "number") {
      violations.push(
        `${relPath} -> coverage.thresholds.${metric} was removed or is no longer a number literal (was ${oldValue}). Coverage floors are raise-only and never deleted.`,
      )
    } else if (newValue < oldValue) {
      violations.push(
        `${relPath} -> coverage.thresholds.${metric}: ${oldValue} -> ${newValue}. Ratchets are raise-only — write the missing tests instead (pnpm --filter <pkg> test prints the uncovered files).`,
      )
    }
  }
  for (const entry of cur.exclude) {
    if (!old.exclude.includes(entry)) {
      violations.push(
        `${relPath} -> new coverage.exclude entry "${entry}". The measured surface only grows — excluding code the default run CAN execute "raises" coverage by measuring less.`,
      )
    }
  }
  if (old.enabled !== false && cur.enabled !== undefined && cur.enabled !== true) {
    violations.push(
      `${relPath} -> coverage.enabled is now ${String(cur.enabled)}. Switching coverage off disables every threshold.`,
    )
  }
  for (const entry of cur.opaque) {
    if (!old.opaque.includes(entry)) {
      violations.push(
        `${relPath} -> new spread/shorthand \`${entry}\` inside coverage. The ratchet reads literals only — inline the values.`,
      )
    }
  }
  return violations
}

function compareStryker(relPath, oldJson, newJson, fileExists) {
  const violations = []
  if (newJson === null) {
    return [
      `${relPath} was removed. The mutation gate needs it — removing it drops the package out of the diff gate.`,
    ]
  }
  const oldBreak = oldJson?.thresholds?.break
  const newBreak = newJson?.thresholds?.break
  const breakRaised =
    typeof newBreak === "number" && typeof oldBreak === "number" && newBreak > oldBreak
  if (typeof oldBreak === "number" && (typeof newBreak !== "number" || newBreak < oldBreak)) {
    violations.push(
      `${relPath} -> thresholds.break: ${oldBreak} -> ${String(newBreak)}. The mutation floor is raise-only — kill the surviving mutants (write the missing assertions) instead of lowering it.`,
    )
  }
  const oldMutate = Array.isArray(oldJson?.mutate) ? oldJson.mutate : []
  const newMutate = Array.isArray(newJson?.mutate) ? newJson.mutate : []
  const pkgDir = path.posix.dirname(relPath)
  // Negated globs invert the direction: removing "!x" or adding "x" GROWS the
  // measured surface (allowed); removing "x" or adding "!x" SHRINKS it. A
  // literal entry whose file is gone (deleted/renamed) may leave freely.
  const isLiteralPath = (p) => !/[*?[\]{}!]/.test(p)
  const shrinkers = [
    ...oldMutate.filter(
      (p) =>
        !p.startsWith("!") &&
        !newMutate.includes(p) &&
        !(isLiteralPath(p) && !fileExists(path.posix.join(pkgDir, p))),
    ),
    ...newMutate.filter((p) => p.startsWith("!") && !oldMutate.includes(p)),
  ]
  if (shrinkers.length > 0 && !breakRaised) {
    violations.push(
      `${relPath} -> mutate allowlist shrank (${shrinkers.join(", ")}) without raising thresholds.break. Shrinking the measured surface "improves" the score by measuring less — allowed ONLY together with a break raise for the remaining surface.`,
    )
  }
  const oldExcluded = oldJson?.mutator?.excludedMutations ?? []
  for (const mutation of newJson?.mutator?.excludedMutations ?? []) {
    if (!oldExcluded.includes(mutation)) {
      violations.push(
        `${relPath} -> new mutator.excludedMutations entry "${mutation}". Excluding mutators measures less — kill the mutants instead.`,
      )
    }
  }
  return violations
}

function compareEslint(relPath, oldText, newText) {
  if (newText === null) return [`${relPath} was removed — every ESLint gate goes with it.`]
  const old = extractEslintRatchets(relPath, oldText)
  const cur = extractEslintRatchets(relPath, newText)
  const violations = cur.errors.map(
    (e) => `${relPath} -> ${e}. A ratchet the gate cannot read is a disabled ratchet.`,
  )
  for (const mapName of RATCHET_MAPS) {
    const oldMap = old.maps[mapName]
    const newMap = cur.maps[mapName]
    if (!oldMap) continue
    if (!newMap) {
      violations.push(
        `${relPath} -> \`export const ${mapName}\` is gone. Keep the (possibly empty) literal — the ratchet reads it.`,
      )
      continue
    }
    for (const [file, value] of Object.entries(newMap)) {
      if (!(file in oldMap)) {
        violations.push(
          `${relPath} -> new ${mapName} entry "${file}" (${value}). The debt list only shrinks — split/simplify the file instead of freezing new debt.`,
        )
      } else if (value > oldMap[file]) {
        violations.push(
          `${relPath} -> ${mapName} "${file}": ${oldMap[file]} -> ${value}. The debt list only shrinks — refactor the file back under its frozen value.`,
        )
      }
    }
  }
  for (const [key, setting] of Object.entries(cur.budgets)) {
    const before = old.budgets[key]
    if (!before) {
      violations.push(
        `${relPath} -> new ${key.split(" | ")[0]} setting (${key}). New code gets the global budget; an override or exemption is new debt — fix the code instead.`,
      )
      continue
    }
    setting.numbers.forEach((value, i) => {
      if (typeof before.numbers[i] === "number" && value > before.numbers[i]) {
        violations.push(
          `${relPath} -> ${key}: ${before.numbers[i]} -> ${value}. Budgets only tighten.`,
        )
      }
    })
  }
  for (const [key, setting] of Object.entries(old.budgets)) {
    if (!cur.budgets[key] && !setting.exemption && setting.numbers.length > 0) {
      violations.push(
        `${relPath} -> the budget setting "${key}" was removed. The global complexity/max-lines budgets are never dropped.`,
      )
    }
  }
  for (const entry of cur.ignores) {
    if (!old.ignores.includes(entry)) {
      violations.push(
        `${relPath} -> new \`ignores\` entry "${entry}". Ignore lists are shrink-only — an ignored file escapes every gate in that block.`,
      )
    }
  }
  return violations
}

function compareKnip(relPath, oldJson, newJson) {
  const oldIgnores = collectKnipIgnores(oldJson)
  const violations = []
  for (const entry of collectKnipIgnores(newJson ?? {})) {
    if (!oldIgnores.has(entry)) {
      violations.push(
        `${relPath} -> new ignore entry "${entry}". Ignore lists are shrink-only — delete the dead code / declare the dependency instead.`,
      )
    }
  }
  return violations
}

function compareCharBudgets(relPath, oldJson, newJson) {
  const violations = []
  for (const [name, oldValue] of Object.entries(oldJson ?? {})) {
    if (name.startsWith("$") || typeof oldValue !== "number") continue
    const newValue = newJson?.[name]
    if (typeof newValue !== "number") {
      violations.push(`${relPath} -> budget "${name}" was removed (was ${oldValue}).`)
    } else if (newValue > oldValue) {
      violations.push(
        `${relPath} -> "${name}": ${oldValue} -> ${newValue} model-visible characters. The LLM-facing tool surface budget is shrink-only — trim descriptions/schemas elsewhere, or justify the growth with a Ratchet-Exception trailer.`,
      )
    }
  }
  return violations
}

/** `a && b && c` → the chained commands, whitespace-normalized. */
const chainSegments = (script) =>
  typeof script === "string"
    ? script
        .split("&&")
        .map((s) => s.trim().replace(/\s+/g, " "))
        .filter(Boolean)
    : []

const deadcodeExcludes = (script) =>
  [...String(script ?? "").matchAll(/--exclude[= ]([\w,]+)/g)].flatMap((m) => m[1].split(","))

function compareRootScripts(relPath, oldJson, newJson) {
  const violations = []
  for (const name of ["lint", "test"]) {
    const kept = new Set(chainSegments(newJson?.scripts?.[name]))
    for (const segment of chainSegments(oldJson?.scripts?.[name])) {
      if (!kept.has(segment)) {
        violations.push(
          `${relPath} -> "${segment}" dropped out of \`pnpm ${name}\`. Gates are never unhooked from the chain.`,
        )
      }
    }
  }
  const oldExcludes = deadcodeExcludes(oldJson?.scripts?.["lint:deadcode"])
  for (const kind of deadcodeExcludes(newJson?.scripts?.["lint:deadcode"])) {
    if (!oldExcludes.includes(kind)) {
      violations.push(
        `${relPath} -> lint:deadcode now excludes "${kind}". knip's measured issue types only grow.`,
      )
    }
  }
  return violations
}

/**
 * Compare one ratchet file's base text with its new text (null = absent).
 * `fileExists(repoRelPath)` answers for the working tree (stale mutate
 * entries); it defaults to "exists", the conservative answer.
 */
export function checkRatchetFile(relPath, oldText, newText, fileExists = () => true) {
  if (oldText === null || oldText === undefined) return [] // introduced in this diff
  const kind = ratchetKind(relPath)
  if (kind === "vitest") return compareVitest(relPath, oldText, newText)
  if (kind === "eslint") return compareEslint(relPath, oldText, newText)

  const parse = (text) =>
    relPath.endsWith(".jsonc") ? parseJsonc(relPath, text) : JSON.parse(text)
  let oldJson
  try {
    oldJson = parse(oldText)
  } catch {
    return [] // unreadable on the base: nothing trustworthy to compare
  }
  let newJson = null
  if (newText !== null) {
    try {
      newJson = parse(newText)
    } catch {
      return [`${relPath} is not valid JSON — a broken ratchet file disables the gate.`]
    }
  }
  if (kind === "stryker") return compareStryker(relPath, oldJson, newJson, fileExists)
  if (kind === "knip") return compareKnip(relPath, oldJson, newJson)
  if (kind === "char-budgets") return compareCharBudgets(relPath, oldJson, newJson)
  if (kind === "root-scripts") return compareRootScripts(relPath, oldJson, newJson)
  return []
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    })
  const fail = (message) => {
    console.error(`check-ratchets: ${message}`)
    process.exit(1)
  }

  const baseRef =
    process.argv[2] ??
    (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "origin/main")

  if (git("rev-parse", "--is-shallow-repository").trim() === "true") {
    fail(
      "shallow clone — the merge base may be missing. In CI check out with `fetch-depth: 0`; locally run `git fetch --unshallow`. Refusing to skip silently.",
    )
  }
  let mergeBase
  try {
    mergeBase = git("merge-base", baseRef, "HEAD").trim()
  } catch {
    fail(
      `cannot compute the merge base against ${baseRef}. Fetch it first (git fetch origin), or pass the base ref as the first argument. Refusing to skip silently.`,
    )
  }
  if (mergeBase === git("rev-parse", "HEAD").trim()) {
    console.log(
      `check-ratchets: HEAD is the merge base with ${baseRef} — comparing the working tree against it.`,
    )
  }

  const listed = (out) => out.split("\n").filter((f) => f && ratchetKind(f) !== null)
  const baseFiles = new Set(listed(git("ls-tree", "-r", "--name-only", mergeBase)))
  const headFiles = listed(git("ls-files", "--cached", "--others", "--exclude-standard"))
  const fileExists = (rel) => fs.existsSync(path.join(repoRoot, rel))

  const violations = []
  for (const rel of [...new Set([...baseFiles, ...headFiles])].sort()) {
    const oldText = baseFiles.has(rel) ? git("show", `${mergeBase}:${rel}`) : null
    const abs = path.join(repoRoot, rel)
    const newText = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null
    violations.push(...checkRatchetFile(rel, oldText, newText, fileExists))
  }

  if (violations.length === 0) {
    console.log(
      `check-ratchets: ${baseFiles.size} ratchet file(s) vs ${baseRef} (${mergeBase.slice(0, 9)}) — all move in the right direction.`,
    )
    return
  }

  const commitMessages = git("log", `${mergeBase}..HEAD`, "--format=%B")
  const reason = EXCEPTION_TRAILER.exec(commitMessages)?.[0]
  const inCi = Boolean(process.env.GITHUB_ACTIONS)
  for (const violation of violations) {
    if (reason) console.log(`${inCi ? "::warning::" : ""}RATCHET EXCEPTION APPLIED — ${violation}`)
    else console.error(`${inCi ? "::error::" : ""}RATCHET VIOLATION ${violation}`)
  }
  if (reason) {
    console.log(
      `check-ratchets: ${violations.length} violation(s) waved through by commit trailer "${reason}". Reviewers: this is the single documented escape — check the reason.`,
    )
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### ⚠️ Ratchet exception applied\n\n\`${reason}\`\n\n${violations.map((v) => `- ${v}`).join("\n")}\n`,
      )
    }
    return
  }
  fail(
    `${violations.length} violation(s). Ratchets only move one way — fix the code, not the threshold. The single escape (requires review): a commit trailer "Ratchet-Exception: <reason>".`,
  )
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) main()
