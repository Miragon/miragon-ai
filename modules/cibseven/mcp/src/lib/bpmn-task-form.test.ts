import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { inferTaskFormFieldsFromBpmn, parseConditionExpression } from "./bpmn-task-form.js"

const miraveloBpmn = readFileSync(
  new URL(
    "../../../../../plugins/examples/cibseven-example/src/main/resources/miravelo-leasing.bpmn",
    import.meta.url,
  ),
  "utf8",
)

describe("parseConditionExpression", () => {
  it("extracts variable + string value from a simple equality", () => {
    expect(parseConditionExpression('${decision == "positive"}')).toEqual([
      { variable: "decision", literal: { value: "positive", type: "String" } },
    ])
  })

  it("extracts boolean literal", () => {
    expect(parseConditionExpression("${creditworthy == true}")).toEqual([
      { variable: "creditworthy", literal: { value: true, type: "Boolean" } },
    ])
  })

  it("handles long literals", () => {
    expect(parseConditionExpression("${amount > 1000}")).toEqual([
      { variable: "amount", literal: { value: 1000, type: "Long" } },
    ])
  })

  it("returns empty for non-comparison expressions", () => {
    expect(parseConditionExpression("${someFunction()}")).toEqual([])
  })

  it("supports value-on-left form", () => {
    expect(parseConditionExpression('${"positive" == decision}')).toEqual([
      { variable: "decision", literal: { value: "positive", type: "String" } },
    ])
  })
})

describe("inferTaskFormFieldsFromBpmn — Miravelo Decide on Application", () => {
  it("derives `decision` field with positive/negative values from the gateway", () => {
    const fields = inferTaskFormFieldsFromBpmn(miraveloBpmn, "Activity_DecideOnApplication")
    const decision = fields.find((f) => f.name === "decision")
    expect(decision).toBeDefined()
    expect(decision?.source).toBe("inferred-from-gateway")
    expect(decision?.type).toBe("String")
    expect(decision?.suggestedValues).toContain("positive")
  })

  it("returns no fields for a task that does not exist", () => {
    expect(inferTaskFormFieldsFromBpmn(miraveloBpmn, "Activity_DoesNotExist")).toEqual([])
  })

  it("returns no fields for a task whose downstream has no conditions", () => {
    // Activity_AccelerateDecision goes to Event_DecisionAccelerated (an end
    // event), no gateway with conditions in between.
    expect(inferTaskFormFieldsFromBpmn(miraveloBpmn, "Activity_AccelerateDecision")).toEqual([])
  })
})
