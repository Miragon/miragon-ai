import { describe, expect, it } from "vitest"
// Imported from the modules themselves, not ./index.js: the index also
// re-exports the SDK-bound reads, and loading the generated SDK would put its
// hundreds of wrappers into this package's coverage measurement.
import {
  ENGINE_DATE_INPUT_FORMS,
  isEngineDateInput,
  toEngineDate,
  toOptionalEngineDate,
} from "./dates.js"

/** The ONLY shape CIB Seven parses (verified live: every other form is a 400). */
const ENGINE_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{4}$/

describe("toEngineDate", () => {
  it.each([
    ["2026-10-01", "2026-10-01T00:00:00.000+0000"],
    ["2026-10-01T00:00:00Z", "2026-10-01T00:00:00.000+0000"],
    ["2026-10-01t08:30:00z", "2026-10-01T08:30:00.000+0000"],
    ["2026-10-01T08:30Z", "2026-10-01T08:30:00.000+0000"],
    ["2026-10-01T08:30:00.000Z", "2026-10-01T08:30:00.000+0000"],
    ["2026-10-01T08:30:00.5Z", "2026-10-01T08:30:00.500+0000"],
    ["2026-10-01T08:30:00,25Z", "2026-10-01T08:30:00.250+0000"],
    ["2026-10-01T08:30:00.123456789Z", "2026-10-01T08:30:00.123+0000"],
    ["2026-10-01T08:30:00+02:00", "2026-10-01T08:30:00.000+0200"],
    ["2026-10-01T08:30:00-05:30", "2026-10-01T08:30:00.000-0530"],
    ["2026-10-01T08:30:00+02", "2026-10-01T08:30:00.000+0200"],
    ["2026-10-01 08:30:00+0200", "2026-10-01T08:30:00.000+0200"],
    // The engine's own output round-trips unchanged.
    ["2026-09-30T22:00:00.000+0000", "2026-09-30T22:00:00.000+0000"],
    ["  2026-10-01  ", "2026-10-01T00:00:00.000+0000"],
  ])("%s → %s", (input, expected) => {
    expect(toEngineDate(input)).toBe(expected)
    expect(toEngineDate(input)).toMatch(ENGINE_FORMAT)
  })

  it("keeps the instant: the converted value parses to the same epoch", () => {
    for (const input of ["2026-10-01T08:30:00+02:00", "2026-03-29T01:59:59.999-11:45"]) {
      const engine = toEngineDate(input)
      const asIso = engine.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
      expect(Date.parse(asIso)).toBe(Date.parse(input))
    }
  })

  it("writes a Date in UTC with milliseconds", () => {
    expect(toEngineDate(new Date(Date.UTC(2026, 9, 1, 8, 30, 0, 7)))).toBe(
      "2026-10-01T08:30:00.007+0000",
    )
  })

  it("refuses an invalid Date", () => {
    expect(() => toEngineDate(new Date(Number.NaN))).toThrow(RangeError)
  })

  it.each([
    "",
    "yesterday",
    "2026-10-01T08:30:00", // a local time would mean the ENGINE's time zone
    "2026-10-01T08:30",
    "2026-13-01",
    "2026-02-30",
    "2026-02-29", // 2026 is no leap year
    "2026-10-01T24:00:00Z",
    "2026-10-01T23:60:00Z",
    "2026-10-01T23:59:60Z",
    "2026-10-01T08:30:00+24:00",
    "2026-10-01T08:30:00+02:60",
    "2026-10-01T08:30:00+020",
    "26-10-01",
    "2026-1-01",
  ])("refuses %j, naming the accepted forms", (input) => {
    expect(isEngineDateInput(input)).toBe(false)
    expect(() => toEngineDate(input)).toThrow(
      `Invalid date "${input}" — expected ${ENGINE_DATE_INPUT_FORMS}`,
    )
  })

  it("accepts a leap day in a leap year", () => {
    expect(isEngineDateInput("2028-02-29")).toBe(true)
    expect(toEngineDate("2028-02-29")).toBe("2028-02-29T00:00:00.000+0000")
  })

  it("names every accepted form in the shared hint", () => {
    expect(ENGINE_DATE_INPUT_FORMS).toContain("2026-10-01")
    expect(ENGINE_DATE_INPUT_FORMS).toContain("2026-10-01T08:30:00Z")
    expect(ENGINE_DATE_INPUT_FORMS).toContain("+02:00")
  })
})

describe("toOptionalEngineDate", () => {
  it("leaves an absent filter absent and converts a present one", () => {
    expect(toOptionalEngineDate(undefined)).toBeUndefined()
    expect(toOptionalEngineDate("2026-10-01")).toBe("2026-10-01T00:00:00.000+0000")
  })
})
