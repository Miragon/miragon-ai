import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import {
  EXCEPTION_TRAILER,
  checkRatchetFile,
  extractEslintRatchets,
  extractVitestCoverage,
  ratchetKind,
} from "./check-ratchets.mjs"

/**
 * Negative tests for the ratchet self-protection: every forbidden direction
 * must produce a violation, every allowed one must not. The CLI wrapper
 * (merge-base resolution, trailer escape) runs in `pnpm lint`; the direction
 * policy lives in the pure `checkRatchetFile`.
 */

const vitestConfig = ({ thresholds, exclude = "", extra = "" }) => `
import { defineConfig, mergeConfig } from "vitest/config"
import { sharedConfig } from "../../vitest.shared"
export default mergeConfig(sharedConfig, defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      // Ratchet: frozen 2 points under the baseline.
      ${exclude}
      ${thresholds}
      ${extra}
    },
  },
}))
`
const PKG_VITEST = "packages/connectors/camunda/camunda7-client/vitest.config.ts"
const BASE_THRESHOLDS = "thresholds: { statements: 44, branches: 32, functions: 45, lines: 44 },"

describe("ratchetKind", () => {
  it("recognises every monitored location and nothing else", () => {
    assert.equal(ratchetKind("apps/mcp-server-camunda7/vitest.config.ts"), "vitest")
    assert.equal(ratchetKind("packages/core/widget-shell/vitest.config.ts"), "vitest")
    assert.equal(ratchetKind(PKG_VITEST), "vitest")
    assert.equal(ratchetKind("vitest.shared.ts"), "vitest")
    assert.equal(ratchetKind("packages/core/widget-shell/stryker.config.json"), "stryker")
    assert.equal(ratchetKind("eslint.config.mjs"), "eslint")
    assert.equal(ratchetKind("knip.jsonc"), "knip")
    assert.equal(
      ratchetKind("apps/mcp-server-camunda7/test/__golden__/char-budgets.json"),
      "char-budgets",
    )
    assert.equal(ratchetKind("package.json"), "root-scripts")
    assert.equal(ratchetKind("packages/core/widget-shell/package.json"), null)
    assert.equal(ratchetKind("packages/core/widget-shell/vitest.stryker.config.ts"), null)
    assert.equal(ratchetKind("templates/composed-server/vitest.config.ts"), null)
  })
})

describe("vitest coverage thresholds (raise-only, never removed)", () => {
  const base = vitestConfig({ thresholds: BASE_THRESHOLDS })

  it("reads the literal thresholds of the real package configs", () => {
    for (const rel of [PKG_VITEST, "apps/mcp-server-camunda7/vitest.config.ts"]) {
      const { thresholds, error } = extractVitestCoverage(rel, readFileSync(rel, "utf8"))
      assert.equal(error, undefined)
      assert.deepEqual(Object.keys(thresholds).sort(), [
        "branches",
        "functions",
        "lines",
        "statements",
      ])
    }
  })

  it("flags a lowered metric", () => {
    const violations = checkRatchetFile(
      PKG_VITEST,
      base,
      vitestConfig({
        thresholds: "thresholds: { statements: 40, branches: 32, functions: 45, lines: 44 },",
      }),
    )
    assert.equal(violations.length, 1)
    assert.match(violations[0], /thresholds\.statements: 44 -> 40/)
  })

  it("accepts raising and reformatting", () => {
    assert.deepEqual(
      checkRatchetFile(
        PKG_VITEST,
        base,
        vitestConfig({
          thresholds:
            "thresholds: {\n statements: 50,\n branches: 32,\n functions: 45,\n lines: 44\n},",
        }),
      ),
      [],
    )
  })

  it("flags a removed metric, removed thresholds and a non-literal value (fail closed)", () => {
    const dropped = vitestConfig({
      thresholds: "thresholds: { branches: 32, functions: 45, lines: 44 },",
    })
    assert.equal(checkRatchetFile(PKG_VITEST, base, dropped).length, 1)
    assert.equal(checkRatchetFile(PKG_VITEST, base, vitestConfig({ thresholds: "" })).length, 4)
    const computed = vitestConfig({
      thresholds: "thresholds: { statements: FLOOR, branches: 32, functions: 45, lines: 44 },",
    })
    assert.match(checkRatchetFile(PKG_VITEST, base, computed)[0], /no longer a number literal/)
    assert.match(checkRatchetFile(PKG_VITEST, base, null)[0], /was removed/)
  })

  it("flags coverage switched off and a spread that could hide thresholds", () => {
    const off = vitestConfig({ thresholds: BASE_THRESHOLDS, extra: "enabled: false," })
    assert.match(checkRatchetFile(PKG_VITEST, base, off)[0], /coverage\.enabled is now false/)
    const spread = vitestConfig({ thresholds: BASE_THRESHOLDS, extra: "...looser," })
    assert.match(checkRatchetFile(PKG_VITEST, base, spread)[0], /spread\/shorthand/)
  })

  it("fails closed on an ambiguous second coverage block", () => {
    const twice = `${base}\nexport const other = { coverage: { thresholds: { lines: 1 } } }`
    assert.match(checkRatchetFile(PKG_VITEST, base, twice)[0], /2 `coverage` blocks/)
  })
})

describe("coverage exclude (shrink-only)", () => {
  const shared = (entries) => `
import { coverageConfigDefaults, defineConfig } from "vitest/config"
export const sharedConfig = defineConfig({
  test: { coverage: { provider: "v8", enabled: true, exclude: [
    ...coverageConfigDefaults.exclude,
    ${entries.map((e) => JSON.stringify(e)).join(",\n    ")},
  ] } },
})`
  const base = shared(["**/src/postgres.ts", "**/src/*-store-postgres.ts"])

  it("flags a new exclusion and accepts dropping one", () => {
    const grown = shared(["**/src/postgres.ts", "**/src/*-store-postgres.ts", "**/src/hard.ts"])
    const violations = checkRatchetFile("vitest.shared.ts", base, grown)
    assert.equal(violations.length, 1)
    assert.match(violations[0], /new coverage\.exclude entry "\*\*\/src\/hard\.ts"/)
    assert.deepEqual(checkRatchetFile("vitest.shared.ts", base, shared(["**/src/postgres.ts"])), [])
  })

  it("reads the real shared config", () => {
    const { exclude, enabled } = extractVitestCoverage(
      "vitest.shared.ts",
      readFileSync("vitest.shared.ts", "utf8"),
    )
    assert.equal(enabled, true)
    assert.ok(exclude.includes("...coverageConfigDefaults.exclude"))
    assert.ok(exclude.includes("**/src/postgres.ts"))
  })
})

describe("stryker policy (break raise-only, mutate grow-only)", () => {
  const rel = "packages/core/widget-shell/stryker.config.json"
  const json = (o) => JSON.stringify(o)
  const base = json({ mutate: ["src/a.ts", "src/b.ts"], thresholds: { break: 60 } })

  it("flags a lowered break", () => {
    const violations = checkRatchetFile(
      rel,
      base,
      json({ mutate: ["src/a.ts", "src/b.ts"], thresholds: { break: 50 } }),
    )
    assert.equal(violations.length, 1)
    assert.match(violations[0], /60 -> 50/)
  })

  it("flags a shrunken allowlist without a break raise", () => {
    const violations = checkRatchetFile(
      rel,
      base,
      json({ mutate: ["src/a.ts"], thresholds: { break: 60 } }),
    )
    assert.equal(violations.length, 1)
    assert.match(violations[0], /measuring less/)
  })

  it("accepts shrinking together with a break raise, and growing", () => {
    assert.deepEqual(
      checkRatchetFile(rel, base, json({ mutate: ["src/a.ts"], thresholds: { break: 70 } })),
      [],
    )
    assert.deepEqual(
      checkRatchetFile(
        rel,
        base,
        json({ mutate: ["src/a.ts", "src/b.ts", "src/c.ts"], thresholds: { break: 60 } }),
      ),
      [],
    )
  })

  it("lets an entry go whose file no longer exists (deleted or renamed)", () => {
    const gone = (p) => !p.endsWith("/src/b.ts")
    assert.deepEqual(
      checkRatchetFile(
        rel,
        base,
        json({ mutate: ["src/a.ts", "src/b2.ts"], thresholds: { break: 60 } }),
        gone,
      ),
      [],
    )
  })

  it("negations invert the direction", () => {
    const negBase = json({ mutate: ["src/*.ts", "!src/untested.ts"], thresholds: { break: 60 } })
    assert.deepEqual(
      checkRatchetFile(rel, negBase, json({ mutate: ["src/*.ts"], thresholds: { break: 60 } })),
      [],
    )
    const violations = checkRatchetFile(
      rel,
      negBase,
      json({ mutate: ["src/*.ts", "!src/untested.ts", "!src/out.ts"], thresholds: { break: 60 } }),
    )
    assert.equal(violations.length, 1)
    assert.match(violations[0], /!src\/out\.ts/)
  })

  it("flags excluded mutators and a deleted config", () => {
    const violations = checkRatchetFile(
      rel,
      base,
      json({
        mutate: ["src/a.ts", "src/b.ts"],
        thresholds: { break: 60 },
        mutator: { excludedMutations: ["StringLiteral"] },
      }),
    )
    assert.match(violations[0], /excludedMutations entry "StringLiteral"/)
    assert.match(checkRatchetFile(rel, base, null)[0], /was removed/)
  })

  it("flags a broken new file", () => {
    assert.match(checkRatchetFile(rel, base, "{ nope")[0], /not valid JSON/)
  })
})

describe("eslint ratchets (shrink-only debt, budgets never raised)", () => {
  const config = ({
    complexity = "{}",
    maxLines = '{ "src/a.ts": 420 }',
    budget = 15,
    extraBlocks = "",
    ignores = '"**/dist/**"',
  } = {}) => `
export const complexityRatchet = ${complexity}
export const maxLinesRatchet = ${maxLines}
export default [
  { ignores: [${ignores}] },
  {
    files: ["packages/*/src/**/*.ts"],
    rules: {
      complexity: ["error", ${budget}],
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  { files: ["src/messages/*.sweep.ts"], rules: { "max-lines": "off" } },
  ${extraBlocks}
  ...Object.entries(complexityRatchet).map(([file, max]) => ({
    files: [file],
    rules: { complexity: ["error", max] },
  })),
  ...Object.entries(maxLinesRatchet).map(([file, max]) => ({
    files: [file],
    rules: { "max-lines": ["error", { max, skipBlankLines: true, skipComments: true }] },
  })),
]`
  const base = config()

  it("reads the real eslint.config.mjs without errors", () => {
    const { maps, budgets, errors } = extractEslintRatchets(
      "eslint.config.mjs",
      readFileSync("eslint.config.mjs", "utf8"),
    )
    assert.deepEqual(errors, [])
    assert.ok("maxLinesRatchet" in maps && "complexityRatchet" in maps)
    const globals = Object.values(budgets).filter((b) => !b.exemption && b.numbers.length > 0)
    assert.deepEqual(globals.map((b) => b.numbers[0]).sort(), [15, 400])
  })

  it("accepts lowering and removing entries, tightening the budget and dropping an exemption", () => {
    assert.deepEqual(
      checkRatchetFile("eslint.config.mjs", base, config({ maxLines: "{}", budget: 12 })),
      [],
    )
    const withoutExemption = base.replace(
      '{ files: ["src/messages/*.sweep.ts"], rules: { "max-lines": "off" } },',
      "",
    )
    assert.deepEqual(checkRatchetFile("eslint.config.mjs", base, withoutExemption), [])
  })

  it("flags a new and a raised debt entry", () => {
    const violations = checkRatchetFile(
      "eslint.config.mjs",
      base,
      config({ maxLines: '{ "src/a.ts": 430, "src/b.ts": 410 }' }),
    )
    assert.equal(violations.length, 2)
    assert.match(violations.join("\n"), /"src\/a\.ts": 420 -> 430/)
    assert.match(violations.join("\n"), /new maxLinesRatchet entry "src\/b\.ts"/)
  })

  it("flags a raised global budget", () => {
    const violations = checkRatchetFile("eslint.config.mjs", base, config({ budget: 20 }))
    assert.equal(violations.length, 1)
    assert.match(violations[0], /15 -> 20/)
  })

  it("flags an override block that bypasses the debt maps", () => {
    for (const block of [
      '{ files: ["src/big.ts"], rules: { complexity: ["error", 40] } },',
      '{ files: ["src/big.ts"], rules: { "max-lines": "off" } },',
      '{ files: ["src/big.ts"], rules: { complexity: "warn" } },',
    ]) {
      const violations = checkRatchetFile("eslint.config.mjs", base, config({ extraBlocks: block }))
      assert.equal(violations.length, 1, block)
      assert.match(violations[0], /New code gets the global budget/)
    }
  })

  it("flags a removed global budget and a non-literal debt map", () => {
    const noBudget = base.replace('complexity: ["error", 15],', "")
    assert.match(
      checkRatchetFile("eslint.config.mjs", base, noBudget).join("\n"),
      /budget setting .* was removed/,
    )
    const computed = config({ maxLines: "buildDebt()" })
    assert.match(
      checkRatchetFile("eslint.config.mjs", base, computed).join("\n"),
      /maxLinesRatchet is not an object literal/,
    )
  })

  it("flags a grown ignores list", () => {
    const violations = checkRatchetFile(
      "eslint.config.mjs",
      base,
      config({ ignores: '"**/dist/**", "packages/x/src/tools/raw.ts"' }),
    )
    assert.equal(violations.length, 1)
    assert.match(violations[0], /new `ignores` entry "packages\/x\/src\/tools\/raw\.ts"/)
  })

  it("resolves exemption lists moved into constants, and still sees them grow", () => {
    const gate = (list) =>
      `${list}\nexport default [{ files: ["src/**"], ignores: [...exempt], rules: { "no-restricted-syntax": ["error"] } }]`
    const literal = `const exempt = []\nexport default [{ files: ["src/**"], ignores: ["src/widget-tools.ts"], rules: { "no-restricted-syntax": ["error"] } }]`
    assert.deepEqual(
      checkRatchetFile(
        "eslint.config.mjs",
        literal,
        gate('const exempt = ["src/widget-tools.ts"]'),
      ),
      [],
    )
    const grown = checkRatchetFile(
      "eslint.config.mjs",
      literal,
      gate('const exempt = ["src/widget-tools.ts", "src/tools/raw.ts"]'),
    )
    assert.equal(grown.length, 1)
    assert.match(grown[0], /src\/tools\/raw\.ts/)
  })

  it("ignores parser-project partitions (no rules) — they route files, not exempt them", () => {
    const partition = (globs) =>
      `export default [{ ignores: [${globs}], languageOptions: { parserOptions: {} } }]`
    assert.deepEqual(
      checkRatchetFile(
        "eslint.config.mjs",
        partition('"ui/**"'),
        partition('"ui/**", "widgets/**"'),
      ),
      [],
    )
  })
})

describe("knip policy (ignore lists shrink-only)", () => {
  const base = `{
    // comment
    "ignore": ["templates/**"],
    "workspaces": { "docs": { "ignoreDependencies": ["vue",], }, },
  }`

  it("flags grown top-level and nested ignore lists", () => {
    const top = base.replace('["templates/**"]', '["templates/**", "src/dead.ts"]')
    assert.match(checkRatchetFile("knip.jsonc", base, top)[0], /src\/dead\.ts/)
    const nested = base.replace('["vue",]', '["vue", "left-pad"]')
    assert.match(checkRatchetFile("knip.jsonc", base, nested)[0], /left-pad/)
  })

  it("accepts shrinking and reads the real knip.jsonc", () => {
    assert.deepEqual(checkRatchetFile("knip.jsonc", base, base.replace('"vue",', "")), [])
    const real = readFileSync("knip.jsonc", "utf8")
    assert.deepEqual(checkRatchetFile("knip.jsonc", real, real), [])
  })
})

describe("char budgets (shrink-only)", () => {
  const rel = "apps/mcp-server-camunda7/test/__golden__/char-budgets.json"
  const base = JSON.stringify({ $comment: "x", "tools-admin": 1000 })

  it("flags growth and removal, accepts shrinking", () => {
    assert.match(
      checkRatchetFile(rel, base, JSON.stringify({ "tools-admin": 1001 }))[0],
      /1000 -> 1001/,
    )
    assert.match(checkRatchetFile(rel, base, JSON.stringify({}))[0], /was removed/)
    assert.deepEqual(checkRatchetFile(rel, base, JSON.stringify({ "tools-admin": 900 })), [])
  })
})

describe("root scripts (no gate unhooked)", () => {
  const pkg = (lint, test = "turbo run test && pnpm test:scripts") =>
    JSON.stringify({ scripts: { lint, test, "lint:deadcode": "knip --exclude exports,types" } })
  const base = pkg("turbo run lint && pnpm lint:ratchets && pnpm lint:deadcode")

  it("flags a gate dropped from the lint or test chain", () => {
    assert.match(
      checkRatchetFile("package.json", base, pkg("turbo run lint && pnpm lint:deadcode"))[0],
      /"pnpm lint:ratchets" dropped out of `pnpm lint`/,
    )
    assert.match(
      checkRatchetFile(
        "package.json",
        base,
        pkg("turbo run lint && pnpm lint:ratchets && pnpm lint:deadcode", "turbo run test"),
      )[0],
      /test:scripts/,
    )
  })

  it("accepts an added gate and flags a new knip exclusion", () => {
    assert.deepEqual(
      checkRatchetFile(
        "package.json",
        base,
        pkg("turbo run lint && pnpm lint:ratchets && pnpm lint:new && pnpm lint:deadcode"),
      ),
      [],
    )
    const looser = base.replace("exports,types", "exports,types,files")
    assert.match(checkRatchetFile("package.json", base, looser)[0], /excludes "files"/)
  })
})

describe("introduction and the escape trailer", () => {
  it("a file absent on the base produces no violations", () => {
    assert.deepEqual(checkRatchetFile(PKG_VITEST, null, vitestConfig({ thresholds: "" })), [])
    assert.deepEqual(checkRatchetFile("knip.jsonc", undefined, "{}"), [])
  })

  it("the trailer must be a line of its own with a reason", () => {
    assert.ok(EXCEPTION_TRAILER.test("fix: x\n\nRatchet-Exception: module moved to core"))
    assert.ok(!EXCEPTION_TRAILER.test("fix: x\n\nRatchet-Exception: "))
    assert.ok(!EXCEPTION_TRAILER.test("mentions Ratchet-Exception: inline"))
  })
})
