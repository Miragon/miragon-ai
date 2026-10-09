import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, it } from "node:test"
import {
  checkPackageScripts,
  expandWorkspaceGlobs,
  workspaceGlobs,
} from "./check-package-scripts.mjs"

const COMPLETE = { lint: "eslint src", typecheck: "tsc --noEmit", test: "vitest run" }

describe("checkPackageScripts", () => {
  it("accepts a package that defines lint, typecheck and test", () => {
    assert.deepEqual(checkPackageScripts("packages/x", COMPLETE), [])
    assert.deepEqual(
      checkPackageScripts("apps/y", {
        lint: "eslint src test test-host",
        typecheck: "tsc --noEmit && tsc -p tsconfig.ui.json",
        test: "vitest run",
      }),
      [],
    )
  })

  it("flags each missing script — turbo would skip the package silently", () => {
    const errors = checkPackageScripts("packages/x", {
      typecheck: "tsc --noEmit",
      test: "vitest run",
    })
    assert.equal(errors.length, 1)
    assert.match(errors[0], /missing "lint" script/)
    assert.equal(checkPackageScripts("packages/x", undefined).length, 3)
  })

  it("flags a script that exists but runs nothing of substance", () => {
    const errors = checkPackageScripts("packages/x", {
      ...COMPLETE,
      lint: "true",
      test: "echo skipped",
    })
    assert.equal(errors.length, 2)
    assert.match(errors[0], /"lint" script is "true"/)
    assert.match(errors[1], /expected it to run `vitest run`/)
  })

  it("requires the lint script to cover src", () => {
    assert.equal(checkPackageScripts("packages/x", { ...COMPLETE, lint: "eslint test" }).length, 1)
  })

  it("rejects commands that run the tool but switch its gate off", () => {
    for (const scripts of [
      { test: "vitest run --coverage.enabled=false" },
      { test: "vitest run --coverage.thresholds.lines=0" },
      { test: "vitest run --passWithNoTests" },
      { test: "vitest run || true" },
      { lint: "eslint src || true" },
      { lint: "eslint src --rule 'complexity: off'" },
      { lint: "eslint src --no-config-lookup" },
      { lint: "eslint src/index.ts" },
      { typecheck: "tsc --version" },
      { typecheck: "tsc --noEmit; true" },
    ]) {
      const errors = checkPackageScripts("packages/x", { ...COMPLETE, ...scripts })
      assert.equal(errors.length, 1, JSON.stringify(scripts))
      assert.match(errors[0], /expected/, JSON.stringify(scripts))
    }
  })

  it("requires typecheck to cover every extra tsconfig project of the package", () => {
    const tsconfigs = ["tsconfig.widgets.json"]
    assert.match(
      checkPackageScripts("packages/x", COMPLETE, { tsconfigs })[0],
      /does not run `tsc -p tsconfig\.widgets\.json`/,
    )
    assert.deepEqual(
      checkPackageScripts(
        "packages/x",
        { ...COMPLETE, typecheck: "tsc --noEmit && tsc -p tsconfig.widgets.json" },
        { tsconfigs },
      ),
      [],
    )
  })

  it("requires the plain `stryker run` where a stryker.config.json exists", () => {
    assert.match(
      checkPackageScripts("packages/x", COMPLETE, { hasStryker: true })[0],
      /missing "test:mutation"/,
    )
    assert.match(
      checkPackageScripts(
        "packages/x",
        { ...COMPLETE, "test:mutation": "stryker run lax.json" },
        { hasStryker: true },
      )[0],
      /"test:mutation" script is "stryker run lax\.json"/,
    )
    assert.deepEqual(
      checkPackageScripts(
        "packages/x",
        { ...COMPLETE, "test:mutation": "stryker run" },
        { hasStryker: true },
      ),
      [],
    )
  })
})

describe("workspace discovery", () => {
  it("reads the plain-list packages: globs and stops at the next top-level key", () => {
    const yaml = [
      "packages:",
      '  - "apps/*"',
      "  - packages/core/*",
      "  - 'docs' # site",
      "",
      "overrides:",
      '  qs: "^6"',
    ].join("\n")
    assert.deepEqual(workspaceGlobs(yaml), ["apps/*", "packages/core/*", "docs"])
  })

  it("expands one- and two-level globs to dirs that carry a package.json", () => {
    const root = mkdtempSync(path.join(tmpdir(), "pkg-scripts-"))
    try {
      for (const dir of ["apps/a", "packages/connectors/fam/x-client", "docs", "apps/no-pkg"]) {
        mkdirSync(path.join(root, dir), { recursive: true })
        if (dir !== "apps/no-pkg") writeFileSync(path.join(root, dir, "package.json"), "{}")
      }
      assert.deepEqual(
        expandWorkspaceGlobs(root, ["apps/*", "packages/connectors/*/*", "docs", "missing/*"]),
        ["apps/a", "docs", "packages/connectors/fam/x-client"],
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
