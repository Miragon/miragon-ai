import { describe, expect, it } from "vitest"
import { engineArg, engineCallRule } from "./engine-scope.js"

describe("engine-scope prompt fragments", () => {
  it("opens a call template's arguments with the viewed engine", () => {
    expect(`camunda7_list_incidents({ ${engineArg("prod-b")}processInstanceId: "p1" })`).toBe(
      'camunda7_list_incidents({ engine: "prod-b", processInstanceId: "p1" })',
    )
  })

  // Strict input refuses an `engine` the tool does not take, so the rule names
  // the engine-less tools instead of claiming EVERY camunda7_* call.
  it("tells the model to pass the viewed engine on every call that takes one", () => {
    expect(engineCallRule("prod-b")).toBe(
      ' Pass engine: "prod-b" on every camunda7_* call except camunda7_list_engines, camunda7_select_engine, camunda7_show_user_profile and camunda7_save_user_profile, which take no engine: without it a call routes to the saved default engine, which may be a different one.',
    )
  })

  it.each([undefined, null, ""])("adds nothing without a known engine (%s)", (engineId) => {
    expect(engineArg(engineId)).toBe("")
    expect(engineCallRule(engineId)).toBe("")
  })
})
