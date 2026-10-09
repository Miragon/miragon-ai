import { describe, expect, it } from "vitest"
import {
  MAX_VARIABLE_VALUE_CHARS,
  truncateVariable,
  truncateVariableMap,
  truncateVariableRows,
  VARIABLE_TRUNCATION_NOTE,
} from "./variable-truncation.js"

const AT_CAP = "a".repeat(MAX_VARIABLE_VALUE_CHARS)
const OVER = `${AT_CAP}b`

describe("truncateVariable", () => {
  it("keeps a value at the cap whole and unmarked", () => {
    const variable = { value: AT_CAP, type: "String" }
    expect(truncateVariable(variable)).toBe(variable)
  })

  it("cuts a value over the cap and marks it with the full length", () => {
    expect(truncateVariable({ value: OVER, type: "Json", valueInfo: {} })).toEqual({
      value: AT_CAP,
      type: "Json",
      valueInfo: {},
      truncated: true,
      valueLength: MAX_VARIABLE_VALUE_CHARS + 1,
    })
  })

  it.each([42, true, null, undefined, { nested: "x".repeat(5000) }])(
    "leaves a non-string value (%j) alone",
    (value) => {
      const variable = { value }
      expect(truncateVariable(variable)).toBe(variable)
    },
  )
})

describe("truncateVariableMap / truncateVariableRows", () => {
  it("bounds every entry of a runtime variable map", () => {
    expect(truncateVariableMap({ big: { value: OVER }, small: { value: "s" } })).toEqual({
      big: { value: AT_CAP, truncated: true, valueLength: OVER.length },
      small: { value: "s" },
    })
  })

  it("bounds every row of a page, passing non-rows and non-arrays through", () => {
    expect(truncateVariableRows([{ name: "big", value: OVER }, null, "x"])).toEqual([
      { name: "big", value: AT_CAP, truncated: true, valueLength: OVER.length },
      null,
      "x",
    ])
    expect(truncateVariableRows({ not: "a page" })).toEqual({ not: "a page" })
  })

  it("the description note names the cap and the marker", () => {
    expect(VARIABLE_TRUNCATION_NOTE).toBe(
      "String values over 2000 chars are cut (truncated: true, valueLength = full size).",
    )
  })
})
