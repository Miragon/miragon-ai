import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import {
  EXCEPTION_TRAILER,
  checkRatchetFile,
  compareSuppressions,
  extractEslintRatchets,
  extractVitestCoverage,
  isPullRequest,
  ratchetKind,
  resolveBaseRef,
  suppressionDirectives,
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
    assert.equal(ratchetKind("packages/core/widget-shell/package.json"), "package-scripts")
    assert.equal(ratchetKind("apps/mcp-server-camunda7/package.json"), "package-scripts")
    assert.equal(ratchetKind("packages/core/widget-shell/vitest.stryker.config.ts"), null)
    assert.equal(ratchetKind("templates/composed-server/vitest.config.ts"), null)
    assert.equal(ratchetKind("templates/composed-server/server/package.json"), null)
  })
})

describe("shadowing configs (loaded BEFORE the ratcheted file)", () => {
  // ESLint resolves the nearest eslint.config.* upward from each linted file
  // and tries .js before .mjs; knip tries knip.json before knip.jsonc; Stryker
  // tries stryker.conf.json before stryker.config.json. Each of these would
  // replace a ratcheted config while the ratchet kept reading the old one.
  const SHADOWS = [
    "eslint.config.js",
    "eslint.config.cjs",
    "eslint.config.ts",
    "eslint.config.mts",
    "apps/mcp-server-camunda7/eslint.config.js",
    "packages/connectors/camunda/camunda7-connector/src/data/eslint.config.mjs",
    "knip.json",
    ".knip.json",
    ".knip.jsonc",
    "knip.ts",
    "knip.js",
    "knip.config.ts",
    "knip.config.js",
    "packages/core/widget-shell/stryker.conf.json",
    "packages/core/widget-shell/.stryker.config.json",
    "packages/core/widget-shell/stryker.config.mjs",
    "packages/connectors/camunda/camunda7-client/stryker.conf.cjs",
  ]

  it("flags each one — also when the diff introduces it", () => {
    for (const rel of SHADOWS) {
      assert.equal(ratchetKind(rel), "shadow-config", rel)
      const violations = checkRatchetFile(rel, null, '{"ignore":["**"]}')
      assert.equal(violations.length, 1, rel)
      assert.match(violations[0], /would be loaded INSTEAD of/, rel)
    }
  })

  it("is quiet while the shadow is absent, and outside the tools' lookup paths", () => {
    assert.deepEqual(checkRatchetFile("knip.json", '{"ignore":["**"]}', null), [])
    assert.equal(ratchetKind("templates/composed-server/eslint.config.mjs"), null)
    assert.equal(ratchetKind("docs/eslint.config.js"), null)
    assert.equal(ratchetKind("packages/core/widget-shell/src/stryker.conf.json"), null)
  })

  it("flags a deleted knip.jsonc and a package.json#knip block (merged under knip.jsonc)", () => {
    assert.match(checkRatchetFile("knip.jsonc", "{}", null)[0], /knip\.jsonc was removed/)
    const root = (extra) => JSON.stringify({ scripts: { lint: "turbo run lint" }, ...extra })
    assert.match(
      checkRatchetFile("package.json", root({}), root({ knip: { include: ["files"] } }))[0],
      /package\.json#knip/,
    )
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

  it("flags a package that stops merging sharedConfig (vitest's default is coverage off)", () => {
    const standalone = base.replace("mergeConfig(sharedConfig, defineConfig(", "(defineConfig(")
    assert.match(
      checkRatchetFile(PKG_VITEST, base, standalone).join("\n"),
      /no longer merges sharedConfig/,
    )
    const selfEnabled = vitestConfig({ thresholds: BASE_THRESHOLDS, extra: "enabled: true," })
    assert.deepEqual(
      checkRatchetFile(
        PKG_VITEST,
        base,
        selfEnabled.replace("mergeConfig(sharedConfig, defineConfig(", "(defineConfig("),
      ),
      [],
    )
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

  it("flags dropping `enabled: true` — vitest then defaults to coverage off", () => {
    const dropped = base.replace("enabled: true, ", "")
    assert.match(
      checkRatchetFile("vitest.shared.ts", base, dropped)[0],
      /coverage\.enabled is now undefined \(was true\)/,
    )
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

  it("flags a coverage.include that appears in the shared config", () => {
    const narrowed = base.replace("enabled: true,", 'enabled: true, include: ["src/lib/**"],')
    assert.match(
      checkRatchetFile("vitest.shared.ts", base, narrowed).join("\n"),
      /coverage\.include/,
    )
  })
})

describe("measured surface: include lists only grow (the counterpart of exclude)", () => {
  const base = vitestConfig({ thresholds: BASE_THRESHOLDS })

  it("flags a coverage.include where vitest measured every loaded file", () => {
    const narrowed = vitestConfig({
      thresholds: BASE_THRESHOLDS,
      extra: 'include: ["src/profile.ts"],',
    })
    const violations = checkRatchetFile(PKG_VITEST, base, narrowed)
    assert.equal(violations.length, 1)
    assert.match(violations[0], /coverage\.include appeared/)
  })

  it("lets an existing coverage.include grow, never shrink or vanish", () => {
    const withInclude = (globs) =>
      vitestConfig({ thresholds: BASE_THRESHOLDS, extra: `include: ${JSON.stringify(globs)},` })
    const old = withInclude(["src/**"])
    assert.deepEqual(checkRatchetFile(PKG_VITEST, old, withInclude(["src/**", "test/**"])), [])
    assert.match(
      checkRatchetFile(PKG_VITEST, old, withInclude(["src/lib/**"]))[0],
      /coverage\.include lost "src\/\*\*"/,
    )
    assert.match(checkRatchetFile(PKG_VITEST, old, base)[0], /coverage\.include was removed/)
  })

  it("flags a narrowed test.include and a new test.exclude", () => {
    const narrowed = base.replace(
      'include: ["src/**/*.test.ts"]',
      'include: ["src/lib/**/*.test.ts"]',
    )
    assert.match(
      checkRatchetFile(PKG_VITEST, base, narrowed)[0],
      /test\.include lost "src\/\*\*\/\*\.test\.ts"/,
    )
    const excluded = base.replace(
      'include: ["src/**/*.test.ts"],',
      'include: ["src/**/*.test.ts"], exclude: ["src/widgets/**"],',
    )
    assert.match(checkRatchetFile(PKG_VITEST, base, excluded)[0], /new test\.exclude entry/)
    const grown = base.replace('["src/**/*.test.ts"]', '["src/**/*.test.ts", "test/**/*.test.ts"]')
    assert.deepEqual(checkRatchetFile(PKG_VITEST, base, grown), [])
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

  it("pins every option that decides which mutants exist or how they count", () => {
    const withOption = (extra) =>
      json({ mutate: ["src/a.ts", "src/b.ts"], thresholds: { break: 60 }, ...extra })
    for (const extra of [
      { ignoreStatic: true },
      { ignorers: ["console"] },
      // A timed-out mutant counts as DETECTED: a tiny timeout "kills" them all.
      { timeoutMS: 1 },
      { timeoutFactor: 0.01 },
      { mutator: { plugins: ["jsx"] } },
      { testRunner: "command" },
      { vitest: { configFile: "vitest.lax.config.ts" } },
    ]) {
      const violations = checkRatchetFile(rel, base, withOption(extra))
      assert.equal(violations.length, 1, JSON.stringify(extra))
      assert.match(violations[0], /pinned to the merge base/)
    }
  })

  it("leaves report-only options and the low/high bands free", () => {
    assert.deepEqual(
      checkRatchetFile(
        rel,
        base,
        json({
          mutate: ["src/a.ts", "src/b.ts"],
          thresholds: { break: 60, high: 90, low: 70 },
          concurrency: 2,
          reporters: ["json"],
          incremental: false,
        }),
      ),
      [],
    )
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

  it("keys an ignore by the block it sits in — copying an exemption into the global ignores is new", () => {
    const gates = (globalIgnores) => `export default [
  { ignores: [${globalIgnores}] },
  { files: ["src/**/*.ts"], ignores: ["src/widget-tools/**"], rules: { "no-restricted-syntax": ["error", "X"] } },
]`
    const violations = checkRatchetFile(
      "eslint.config.mjs",
      gates('"**/dist/**"'),
      gates('"**/dist/**", "src/widget-tools/**"'),
    )
    assert.equal(violations.length, 1)
    assert.match(violations[0], /entry "src\/widget-tools\/\*\*" \(exempts from: every rule/)
  })

  it("resolves a shorthand `ignores` const and sees it grow", () => {
    const block = (ignores) =>
      `export default [{ files: ["src/**"], ${ignores}, rules: { "no-restricted-syntax": ["error"] } }]`
    const violations = checkRatchetFile(
      "eslint.config.mjs",
      block('ignores: ["src/widget-tools.ts"]'),
      `const ignores = ["src/widget-tools.ts", "src/tools/**"]\n${block("ignores")}`,
    )
    assert.equal(violations.length, 1)
    assert.match(violations[0], /src\/tools\/\*\*/)
  })

  it("fails closed on every shape the AST cannot read", () => {
    const cases = {
      "rules from a const": [
        'const relaxed = { complexity: "off", "max-lines": "off" }',
        '{ files: ["src/big.ts"], rules: relaxed },',
      ],
      "spread inside rules": [
        "",
        '{ files: ["src/big.ts"], rules: { ...{ complexity: "off" } } },',
      ],
      "computed rule key": ["", '{ files: ["src/big.ts"], rules: { ["complexity"]: "off" } },'],
      "shorthand rules": [
        'const rules = { complexity: "off" }',
        '{ files: ["src/big.ts"], rules },',
      ],
      "spread into a config block": [
        'const lax = { rules: { complexity: "off" } }',
        '{ ...lax, files: ["src/big.ts"] },',
      ],
      "imported config element": ['import lax from "./lax.mjs"', "...lax,"],
      "debt smuggled past the frozen map": [
        "",
        '...Object.entries({ ...maxLinesRatchet, "src/big.ts": 900 }).map(([file, max]) => ({ files: [file], rules: { "max-lines": ["error", { max }] } })),',
      ],
    }
    for (const [label, [pre, block]] of Object.entries(cases)) {
      const violations = checkRatchetFile(
        "eslint.config.mjs",
        base,
        `${pre}\n${config({ extraBlocks: block })}`,
      )
      assert.ok(violations.length > 0, label)
      assert.match(violations.join("\n"), /reads literals only/, label)
    }
  })

  it("treats a gate rule switched off or to warn as an exemption", () => {
    for (const block of [
      '{ files: ["src/tools/raw.ts"], rules: { "no-restricted-syntax": "off" } },',
      '{ files: ["src/tools/raw.ts"], rules: { "no-restricted-syntax": ["warn", "X"] } },',
    ]) {
      const violations = checkRatchetFile("eslint.config.mjs", base, config({ extraBlocks: block }))
      assert.equal(violations.length, 1, block)
      assert.match(violations[0], /exemption/)
    }
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

  it("flags a config-level issue-type exclude, a relaxed rule and a boolean ignore", () => {
    const relaxed = (extra) => base.replace('"ignore":', `${extra}, "ignore":`)
    assert.match(
      checkRatchetFile("knip.jsonc", base, relaxed('"exclude": ["files"]'))[0],
      /exclude: files/,
    )
    assert.match(
      checkRatchetFile("knip.jsonc", base, relaxed('"rules": { "dependencies": "warn" }'))[0],
      /rules\.dependencies: warn/,
    )
    assert.match(
      checkRatchetFile("knip.jsonc", base, relaxed('"ignoreExportsUsedInFile": true'))[0],
      /ignoreExportsUsedInFile: true/,
    )
    assert.deepEqual(
      checkRatchetFile("knip.jsonc", base, relaxed('"rules": { "files": "error" }')),
      [],
    )
  })

  it("flags an issue-type include, a workspace project and a new entry glob", () => {
    const relaxed = (extra) => base.replace('"ignore":', `${extra}, "ignore":`)
    assert.match(
      checkRatchetFile("knip.jsonc", base, relaxed('"include": ["files"]'))[0],
      /"include" appeared/,
    )
    const scoped = base.replace(
      '"ignoreDependencies"',
      '"project": ["src/**"], "ignoreDependencies"',
    )
    assert.match(checkRatchetFile("knip.jsonc", base, scoped)[0], /workspaces\.docs\.project/)
    const entry = base.replace(
      '"ignoreDependencies"',
      '"entry": ["src/dead.ts"], "ignoreDependencies"',
    )
    assert.match(checkRatchetFile("knip.jsonc", base, entry)[0], /entry: src\/dead\.ts/)
  })

  it("lets an existing include grow but never shrink", () => {
    const withInclude = (types) =>
      base.replace('"ignore":', `"include": ${JSON.stringify(types)}, "ignore":`)
    const old = withInclude(["files", "dependencies"])
    assert.deepEqual(
      checkRatchetFile("knip.jsonc", old, withInclude(["files", "dependencies", "unlisted"])),
      [],
    )
    assert.match(
      checkRatchetFile("knip.jsonc", old, withInclude(["files"]))[0],
      /lost "dependencies"/,
    )
    assert.deepEqual(checkRatchetFile("knip.jsonc", old, base), [])
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

  describe("a gate command is pinned to the merge base", () => {
    const BASE_SCRIPTS = {
      lint: "turbo run lint && pnpm lint:architecture && pnpm lint:ratchets && pnpm lint:deadcode",
      test: "turbo run test && pnpm test:scripts",
      "lint:architecture": "depcruise apps/*/src packages/*/src --config .dc.cjs",
      "lint:ratchets": "node scripts/check-ratchets.mjs",
      "lint:deadcode": "knip --exclude exports,types",
      "test:scripts": 'node --test "scripts/*.test.mjs"',
      "test:pg":
        "TEST_DATABASE_URL=${TEST_DATABASE_URL:-x} pnpm --filter @miragon-ai/widget-shell --filter @miragon-ai/camunda7-connector run test",
      typecheck: "turbo run typecheck",
      "format:check": "prettier --check .",
    }
    const withScripts = (scripts) => JSON.stringify({ scripts: { ...BASE_SCRIPTS, ...scripts } })
    const old = withScripts({})

    it("flags a hollowed, an extended and a re-pointed gate alike", () => {
      for (const scripts of [
        { "lint:architecture": "true" },
        { "lint:architecture": "depcruise apps/*/src --config .dc.cjs" },
        // argv[2] wins over the CI base ref: merge-base(HEAD, HEAD) compares nothing
        { "lint:ratchets": "node scripts/check-ratchets.mjs HEAD" },
        { "lint:ratchets": "node scripts/check-ratchets.mjs || true" },
        { "lint:ratchets": "node scripts/check-ratchets.mjs ; true" },
        { "lint:ratchets": "echo node scripts/check-ratchets.mjs" },
        { "lint:deadcode": "knip --exclude exports,types --no-exit-code" },
        { "lint:deadcode": "knip --exclude exports,types --include files" },
        { "lint:deadcode": "knip --exclude exports,types --config lax.json" },
        {
          "lint:architecture":
            "depcruise apps/*/src packages/*/src --config .dc.cjs --exclude packages",
        },
        { "test:scripts": 'node --test "scripts/*.test.mjs" --test-name-pattern=^$' },
        { "test:scripts": 'node --test "scripts/*.test.mjs" || exit 0' },
      ]) {
        const violations = checkRatchetFile("package.json", old, withScripts(scripts))
        assert.equal(violations.length, 1, JSON.stringify(scripts))
        assert.match(violations[0], /pinned to the merge base/, JSON.stringify(scripts))
      }
    })

    it("pins the gates CI runs directly too (test:pg, typecheck, format:check)", () => {
      for (const scripts of [
        // widget-shell is the only package with Postgres suites
        {
          "test:pg":
            "TEST_DATABASE_URL=${TEST_DATABASE_URL:-x} pnpm --filter @miragon-ai/camunda7-connector run test",
        },
        { typecheck: "turbo run typecheck --filter=!@miragon-ai/widget-shell" },
        { "format:check": "prettier --check . || true" },
      ]) {
        const violations = checkRatchetFile("package.json", old, withScripts(scripts))
        assert.equal(violations.length, 1, JSON.stringify(scripts))
      }
      const { "test:pg": _dropped, ...withoutPg } = BASE_SCRIPTS
      assert.match(
        checkRatchetFile("package.json", old, JSON.stringify({ scripts: withoutPg }))[0],
        /"test:pg" was removed/,
      )
    })

    it("lets the --exclude lists shrink, and reformatting pass", () => {
      assert.deepEqual(
        checkRatchetFile(
          "package.json",
          old,
          withScripts({
            "lint:deadcode": "knip --exclude exports",
            "lint:architecture": "depcruise  apps/*/src packages/*/src   --config .dc.cjs",
          }),
        ),
        [],
      )
    })

    it("lets a chain gain plain `pnpm <script>` gates only", () => {
      for (const lint of [
        `exit 0 && ${BASE_SCRIPTS.lint}`,
        `${BASE_SCRIPTS.lint} || true`,
        `${BASE_SCRIPTS.lint}; true`,
        `${BASE_SCRIPTS.lint} && echo done`,
      ]) {
        const violations = checkRatchetFile("package.json", old, withScripts({ lint }))
        assert.ok(violations.length > 0, lint)
      }
      assert.deepEqual(
        checkRatchetFile(
          "package.json",
          old,
          withScripts({ lint: `${BASE_SCRIPTS.lint} && pnpm lint:new`, "lint:new": "node x.mjs" }),
        ),
        [],
      )
    })
  })
})

describe("package gate scripts are pinned to the merge base", () => {
  const rel = "packages/connectors/camunda/camunda7-connector/package.json"
  const BASE = {
    build: "tsc",
    lint: "eslint src",
    "lint:fix": "eslint src --fix",
    typecheck: "tsc --noEmit && tsc -p tsconfig.widgets.json",
    test: "vitest run",
    "test:mutation": "stryker run",
  }
  const pkg = (scripts) =>
    JSON.stringify({ name: "@miragon-ai/x", scripts: { ...BASE, ...scripts } })

  it("flags lint/typecheck/test/test:mutation changed in any way", () => {
    for (const scripts of [
      { test: "vitest run --coverage.enabled=false" },
      { test: "vitest run --coverage.thresholds.lines=0" },
      { lint: "eslint src || true" },
      { lint: "eslint src --rule 'complexity: off'" },
      { lint: "eslint src/index.ts" },
      { typecheck: "tsc --noEmit" },
      { "test:mutation": "stryker run lax.json" },
    ]) {
      const violations = checkRatchetFile(rel, pkg({}), pkg(scripts))
      assert.equal(violations.length, 1, JSON.stringify(scripts))
      assert.match(violations[0], /pinned to the merge base/)
    }
  })

  it("leaves non-gate scripts free and a new package to lint:package-scripts", () => {
    assert.deepEqual(
      checkRatchetFile(rel, pkg({}), pkg({ "lint:fix": "eslint src --fix --cache", dev: "x" })),
      [],
    )
    assert.deepEqual(
      checkRatchetFile(rel, null, pkg({ test: "vitest run --coverage.enabled=false" })),
      [],
    )
  })
})

describe("base ref resolution in CI", () => {
  it("ignores a positional base ref when the PR base is known", () => {
    assert.deepEqual(
      resolveBaseRef(["node", "check-ratchets.mjs", "HEAD"], { GITHUB_BASE_REF: "main" }),
      {
        ref: "origin/main",
        ignoredArg: "HEAD",
      },
    )
    assert.equal(resolveBaseRef(["node", "check-ratchets.mjs", "HEAD"], {}).ref, "HEAD")
    assert.equal(resolveBaseRef(["node", "check-ratchets.mjs"], {}).ref, "origin/main")
  })

  it("knows when an empty comparison would be vacuous", () => {
    assert.equal(isPullRequest({ GITHUB_EVENT_NAME: "pull_request" }), true)
    assert.equal(isPullRequest({ GITHUB_EVENT_NAME: "pull_request_target" }), true)
    assert.equal(isPullRequest({ GITHUB_EVENT_NAME: "push" }), false)
    assert.equal(isPullRequest({}), false)
  })
})

describe("inline suppressions (shrink-only)", () => {
  const rel = "packages/connectors/camunda/camunda7-connector/src/tools/x.ts"
  const code = 'server.tool("x", {}, handler)\n'

  it("flags a new comment that switches a gate off", () => {
    for (const comment of [
      "// eslint-disable-next-line no-restricted-syntax",
      "/* eslint-disable complexity, max-lines */",
      "/* eslint-disable */",
      "// eslint-disable-line max-lines -- legacy file",
      '/* eslint complexity: ["error", 99] */',
      "/* eslint no-restricted-syntax: off */",
      "/* v8 ignore next */",
      "/* istanbul ignore next */",
      "/* c8 ignore start */",
      "// Stryker disable next-line all: flaky",
    ]) {
      const violations = compareSuppressions(rel, code, `${comment}\n${code}`)
      assert.ok(violations.length > 0, comment)
      assert.match(violations[0], new RegExp(`${rel.replace(/[.]/g, "\\.")}:1`), comment)
    }
  })

  it("ignores other rules, comment-like strings and directives the base already had", () => {
    for (const text of [
      "// eslint-disable-next-line @typescript-eslint/no-unused-vars\nconst a = 1\n",
      'const s = "// eslint-disable-next-line complexity"\n',
      "const t = `/* v8 ignore next */`\n",
      "// a comment that mentions eslint-disable complexity\n",
      "/* v8 ignore stop */\n// Stryker restore all\n",
    ]) {
      assert.deepEqual(compareSuppressions(rel, code, text), [], text)
    }
    const kept = `// eslint-disable-next-line complexity\n${code}`
    assert.deepEqual(compareSuppressions(rel, kept, `${code}${kept}`), [])
  })

  it("reads comments in .tsx (not JSX text) and before a closing brace", () => {
    const tsx = [
      "export function A() {",
      "  return <p>// eslint-disable-next-line complexity</p>",
      "  // eslint-disable-next-line max-lines",
      "}",
    ].join("\n")
    assert.deepEqual(
      suppressionDirectives("x.tsx", tsx).map((d) => [d.directive, d.line]),
      [["eslint-disable-next-line max-lines", 3]],
    )
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
