import { describe, expect, it } from "vitest"
import { engineArg, engineCallRule } from "./engine-scope.js"

describe("engine-scope prompt fragments", () => {
  it("opens a call template's arguments with the viewed engine", () => {
    expect(`camunda7_list_incidents({ ${engineArg("prod-b")}processInstanceId: "p1" })`).toBe(
      'camunda7_list_incidents({ engine: "prod-b", processInstanceId: "p1" })',
    )
  })

  it("tells the model to pass the viewed engine on every call", () => {
    expect(engineCallRule("prod-b")).toBe(
      ' Pass engine: "prod-b" on every camunda7_* call: without it a call routes to the saved default engine, which may be a different one.',
    )
  })

  it.each([undefined, null, ""])("adds nothing without a known engine (%s)", (engineId) => {
    expect(engineArg(engineId)).toBe("")
    expect(engineCallRule(engineId)).toBe("")
  })
})
