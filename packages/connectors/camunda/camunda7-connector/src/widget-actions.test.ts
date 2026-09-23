import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { CAMUNDA7_WIDGET_ACTIONS } from "./tool-names.js"

// Lives outside `src/widgets` on purpose: the widget tsconfig is browser-only
// (no Node types), and this guard reads the widget sources from disk.
const WIDGETS_DIR = fileURLToPath(new URL("./widgets/", import.meta.url))

/**
 * Writes that gate themselves instead of via `useCanRun`: the settings panel's
 * save renders from the view's own `canSave`.
 */
const SELF_GATED = new Set(["CAMUNDA7_SAVE_USER_PROFILE"])

/** Every `useToolMutation(<arg>)` first argument in the widget sources, per file. */
function mutationCalls(): Array<{ file: string; arg: string }> {
  const files = readdirSync(WIDGETS_DIR, { recursive: true, encoding: "utf8" }).filter(
    (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
  )
  return files.flatMap((file) =>
    [
      ...readFileSync(join(WIDGETS_DIR, file), "utf8").matchAll(/useToolMutation\(\s*([^,)\s]+)/g),
    ].map((m) => ({ file, arg: m[1] })),
  )
}

/**
 * The widgets hide write buttons the deployment's toolset does not register —
 * but only for tools listed in `CAMUNDA7_WIDGET_ACTIONS`, which is what the
 * `camunda7_widget_actions_data` feed reports on. A new in-widget write missing
 * from that list would never be allowed and its button would silently vanish in
 * EVERY deployment; one gated nowhere would render a button whose click
 * resolves to an unknown tool in `read-only`.
 */
describe("in-widget writes are gated by the deployment's toolset", () => {
  it("finds the widget mutations (the scan is not vacuous)", () => {
    expect(mutationCalls().length).toBeGreaterThanOrEqual(CAMUNDA7_WIDGET_ACTIONS.length)
  })

  it("every useToolMutation target is a listed widget action (or self-gated)", () => {
    const listed = new Set<string>(CAMUNDA7_WIDGET_ACTIONS)
    for (const { file, arg } of mutationCalls()) {
      const tool = arg.replace(/^["'`]|["'`]$/g, "")
      expect(
        listed.has(tool) || SELF_GATED.has(arg),
        `${file}: useToolMutation(${arg}) — add the tool to CAMUNDA7_WIDGET_ACTIONS ` +
          `(tool-names.ts) and render its button only when useCanRun() allows it`,
      ).toBe(true)
    }
  })

  it("every listed widget action is still used by a widget", () => {
    const used = new Set(mutationCalls().map(({ arg }) => arg.replace(/^["'`]|["'`]$/g, "")))
    for (const action of CAMUNDA7_WIDGET_ACTIONS) {
      expect(used.has(action), `${action} is listed but no widget mutates it`).toBe(true)
    }
  })
})
