import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  CAP_EXCEPTION_TRAILER,
  FILE_CAP,
  inMutateScope,
  planMutationRuns,
} from "./mutation-diff.mjs"

const files = (n) => Array.from({ length: n }, (_, i) => `src/f${i}.ts`)

describe("planMutationRuns — the file cap fails loudly instead of skipping", () => {
  it("runs every package under the cap", () => {
    const plan = planMutationRuns(new Map([["packages/core/a", files(FILE_CAP)]]))
    assert.equal(plan.failed, false)
    assert.deepEqual(plan.capped, [])
    assert.equal(plan.runs.length, 1)
  })

  it("FAILS a package over the cap (it used to exit 0 with no mutation check)", () => {
    const plan = planMutationRuns(
      new Map([
        ["packages/core/a", files(FILE_CAP + 1)],
        ["packages/core/b", files(2)],
      ]),
    )
    assert.equal(plan.failed, true)
    assert.deepEqual(plan.capped, [{ pkg: "packages/core/a", count: FILE_CAP + 1 }])
    assert.deepEqual(
      plan.runs.map((r) => r.pkg),
      ["packages/core/b"],
    )
  })

  it("waves the capped package through only with the explicit trailer", () => {
    const plan = planMutationRuns(new Map([["packages/core/a", files(40)]]), {
      exceptionReason: "Mutation-Cap-Exception: full local run 71%",
    })
    assert.equal(plan.failed, false)
    assert.equal(plan.capped.length, 1)
    assert.ok(CAP_EXCEPTION_TRAILER.test("refactor: x\n\nMutation-Cap-Exception: full run 71%"))
    assert.ok(!CAP_EXCEPTION_TRAILER.test("refactor: x\n\nMutation-Cap-Exception: "))
  })
})

describe("inMutateScope", () => {
  it("matches nested globs and honours negations", () => {
    const mutate = ["src/**/*.ts", "!src/**/*.test.ts", "!src/postgres.ts"]
    assert.ok(inMutateScope("src/ui/bpmn-heatmap/x.ts", mutate))
    assert.ok(!inMutateScope("src/ui/x.test.ts", mutate))
    assert.ok(!inMutateScope("src/postgres.ts", mutate))
    assert.ok(!inMutateScope("README.md", mutate))
  })
})
