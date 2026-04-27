import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { extractEmbeddedFormFields, parseConditionExpression } from "./bpmn-task-form.js"

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

  it("extracts both sides of a conjunction", () => {
    expect(parseConditionExpression('${decision == "positive" && creditworthy == true}')).toEqual([
      { variable: "decision", literal: { value: "positive", type: "String" } },
      { variable: "creditworthy", literal: { value: true, type: "Boolean" } },
    ])
  })

  it("extracts both sides of a disjunction", () => {
    expect(parseConditionExpression('${decision == "positive" || decision == "escalate"}')).toEqual(
      [
        { variable: "decision", literal: { value: "positive", type: "String" } },
        { variable: "decision", literal: { value: "escalate", type: "String" } },
      ],
    )
  })

  it("drops dotted identifiers (nested object paths cannot be set as task vars)", () => {
    expect(parseConditionExpression('${customer.segment == "vip"}')).toEqual([])
  })

  it("ignores method-call left-hand sides", () => {
    expect(parseConditionExpression('${decision.equals("positive")}')).toEqual([])
  })

  it("returns an empty list for malformed input", () => {
    expect(parseConditionExpression("")).toEqual([])
    expect(parseConditionExpression("not an expression")).toEqual([])
  })

  it("survives entity-decoded content (engine-stored expressions)", () => {
    expect(parseConditionExpression("${amount &lt; 1000}")).toEqual([])
  })
})

describe("extractEmbeddedFormFields — Miravelo Decide on Application", () => {
  it("returns all form fields from camunda:formData", () => {
    const fields = extractEmbeddedFormFields(miraveloBpmn, "Activity_DecideOnApplication")
    expect(fields.length).toBeGreaterThan(0)
    const names = fields.map((f) => f.name)
    expect(names).toContain("decision")
    expect(names).toContain("creditScore")
  })

  it("marks readonly fields correctly", () => {
    const fields = extractEmbeddedFormFields(miraveloBpmn, "Activity_DecideOnApplication")
    const creditScore = fields.find((f) => f.name === "creditScore")
    expect(creditScore?.readonly).toBe(true)
    const decision = fields.find((f) => f.name === "decision")
    expect(decision?.readonly).toBeUndefined()
  })

  it("populates suggestedValues for decision field", () => {
    const fields = extractEmbeddedFormFields(miraveloBpmn, "Activity_DecideOnApplication")
    const decision = fields.find((f) => f.name === "decision")
    expect(decision?.suggestedValues).toContain("positive")
    expect(decision?.suggestedValues).toContain("negative")
  })

  it("returns empty array for a task without formData", () => {
    expect(extractEmbeddedFormFields(miraveloBpmn, "Activity_DoesNotExist")).toEqual([])
  })

  it("returns readonly-only fields for AccelerateDecision (no decision field)", () => {
    const fields = extractEmbeddedFormFields(miraveloBpmn, "Activity_AccelerateDecision")
    expect(fields.length).toBeGreaterThan(0)
    expect(fields.every((f) => f.readonly === true)).toBe(true)
  })
})
