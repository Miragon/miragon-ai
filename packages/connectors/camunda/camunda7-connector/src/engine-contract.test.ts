import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// Lives outside `src/widgets` on purpose (Node APIs): this guard reads the
// module's sources from disk, like widget-actions.test.ts.
const SRC = fileURLToPath(new URL("./", import.meta.url))

/**
 * Generated SDK operations whose REST contract differs from the client
 * defaults. Each has ONE wrapper in the engine contract
 * (`@miragon-ai/camunda7-client`) that applies the override — a direct call
 * would silently lose it (#328): the text endpoints answer the default
 * `Accept: application/json` with a 406, the variable reads deserialize
 * Object values eagerly (one missing class fails the whole read) and render
 * Json as Jackson's view of the Spin node.
 */
const CONTRACT_WRAPPED: Record<string, string> = {
  getStacktrace: "fetchJobStacktrace",
  getExternalTaskErrorDetails: "fetchExternalTaskErrorDetails",
  getProcessInstanceVariables: "readProcessInstanceVariables",
  getTaskVariables: "readTaskVariables",
  // `/task/{id}/complete` skips the task's form validation; complete through
  // `submit` (`/task/{id}/submit-form`).
  complete: "submit",
}

function sources(): Array<{ file: string; text: string }> {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((file) => ({ file, text: readFileSync(join(SRC, file), "utf8") }))
}

/** Names imported from the generated SDK, per file. */
function sdkImports(text: string): string[] {
  return [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@miragon-ai\/camunda7-client\/sdk"/g)]
    .flatMap((m) => m[1].split(","))
    .map((name) => name.trim().split(/\s+as\s+/)[0])
    .filter(Boolean)
}

describe("engine calls with a contract override go through the engine contract", () => {
  it("finds the SDK imports (the scan is not vacuous)", () => {
    expect(sources().filter(({ text }) => sdkImports(text).length > 0).length).toBeGreaterThan(10)
  })

  it.each(Object.entries(CONTRACT_WRAPPED))("no module calls %s directly", (raw, wrapper) => {
    for (const { file, text } of sources()) {
      expect(
        sdkImports(text),
        `${file}: use ${wrapper} (engine contract) instead of the raw SDK ${raw}`,
      ).not.toContain(raw)
    }
  })

  it("engine dates are written by toEngineDate, never by a local rewrite", () => {
    for (const { file, text } of sources()) {
      expect(text, `${file}: use toEngineDate from the engine contract`).not.toMatch(
        /\.replace\(\s*["']Z["']\s*,\s*["']\+0000["']\s*\)/,
      )
    }
  })
})
