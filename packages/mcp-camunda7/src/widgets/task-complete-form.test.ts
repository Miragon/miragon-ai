import { describe, expect, it } from "vitest"
import { coerceValue } from "./task-complete-form.js"

describe("coerceValue", () => {
  it("passes strings through and parses booleans strictly", () => {
    expect(coerceValue("hello", "String")).toBe("hello")
    expect(coerceValue("true", "Boolean")).toBe(true)
    expect(coerceValue("yes", "Boolean")).toBeUndefined()
  })

  it("parses in-range Long/Integer values", () => {
    expect(coerceValue("42", "Long")).toBe(42)
    expect(coerceValue("-7", "Integer")).toBe(-7)
    expect(coerceValue("9007199254740991", "Long")).toBe(Number.MAX_SAFE_INTEGER)
  })

  it("refuses Long values beyond 2^53 instead of silently rounding", () => {
    // Number("9007199254740993") === 9007199254740992 — writing that to the
    // engine would corrupt the variable without any operator-visible error.
    expect(coerceValue("9007199254740993", "Long")).toBeUndefined()
    expect(coerceValue("-9007199254740993", "Long")).toBeUndefined()
    expect(coerceValue("19007199254740993", "Long")).toBeUndefined()
  })

  it("rejects non-integer input for Long", () => {
    expect(coerceValue("1.5", "Long")).toBeUndefined()
    expect(coerceValue("abc", "Long")).toBeUndefined()
  })
})
