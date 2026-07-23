import { describe, expect, it } from "vitest"
import { formatDate, formatDuration, formatTime, formatTimestamp, truncate } from "./format.js"

const EMPTY = "—"

describe("formatTimestamp / formatDate / formatTime", () => {
  it("renders a valid ISO timestamp", () => {
    const iso = "2026-07-22T10:15:30.000Z"
    expect(formatTimestamp(iso)).toBe(new Date(iso).toLocaleString())
    expect(formatDate(iso)).toBe(new Date(iso).toLocaleDateString())
    expect(formatTime(iso)).toBe(new Date(iso).toLocaleTimeString())
  })

  it("returns the placeholder for null/undefined/empty input", () => {
    for (const value of [null, undefined, ""]) {
      expect(formatTimestamp(value)).toBe(EMPTY)
      expect(formatDate(value)).toBe(EMPTY)
      expect(formatTime(value)).toBe(EMPTY)
    }
  })

  it("returns the placeholder for an unparsable date instead of 'Invalid Date'", () => {
    expect(formatTimestamp("not-a-date")).toBe(EMPTY)
    expect(formatDate("not-a-date")).toBe(EMPTY)
    expect(formatTime("not-a-date")).toBe(EMPTY)
  })
})

describe("formatDuration", () => {
  it("formats the canonical compact family", () => {
    expect(formatDuration(420)).toBe("420ms")
    expect(formatDuration(12_000)).toBe("12s")
    expect(formatDuration(187_000)).toBe("3m 7s")
    expect(formatDuration(5_040_000)).toBe("1h 24m")
  })

  it("rounds fractional milliseconds", () => {
    expect(formatDuration(420.4)).toBe("420ms")
    expect(formatDuration(999.6)).toBe("1s")
  })

  it("returns the placeholder for null, negative and NaN input", () => {
    expect(formatDuration(null)).toBe(EMPTY)
    expect(formatDuration(undefined)).toBe(EMPTY)
    expect(formatDuration(-1)).toBe(EMPTY)
    expect(formatDuration(Number.NaN)).toBe(EMPTY)
  })
})

describe("truncate", () => {
  it("truncates with an ellipsis and passes short values through", () => {
    expect(truncate("abcdef", 3)).toBe("abc…")
    expect(truncate("abc", 3)).toBe("abc")
    expect(truncate(null, 3)).toBe(EMPTY)
  })
})
