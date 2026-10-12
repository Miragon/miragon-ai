import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { increaseIn } from "./helpers.js"
import { DAY_SECONDS, rangeSeconds } from "./windows.js"

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0)
const NOW_SECONDS = NOW / 1000

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW })
})
afterEach(() => {
  vi.useRealTimers()
})

describe("increaseIn", () => {
  it("counts a series born inside the window with its whole value", () => {
    expect(increaseIn('camunda_x_total{engine_id="a"}', { range: "7d" })).toBe(
      '((increase(camunda_x_total{engine_id="a"}[7d]) and present_over_time(camunda_x_total{engine_id="a"}[1h] offset 7d))' +
        ' or (max_over_time(camunda_x_total{engine_id="a"}[7d]) unless present_over_time(camunda_x_total{engine_id="a"}[1h] offset 7d)))',
    )
  })

  it("pins every part of a window that ends in the past", () => {
    const at = NOW_SECONDS - 3 * DAY_SECONDS
    expect(increaseIn("camunda_x_total", { range: "86400s", at })).toBe(
      `((increase(camunda_x_total[86400s] @ ${at}) and present_over_time(camunda_x_total[1h] @ ${at} offset 86400s))` +
        ` or (max_over_time(camunda_x_total[86400s] @ ${at}) unless present_over_time(camunda_x_total[1h] @ ${at} offset 86400s)))`,
    )
  })

  it("reads plain increase() where the hour before the window lies past the retention", () => {
    expect(increaseIn("camunda_x_total", { range: "30d" })).toBe("increase(camunda_x_total[30d])")
    const at = NOW_SECONDS - 29 * DAY_SECONDS
    expect(increaseIn("camunda_x_total", { range: "1d", at })).toBe(
      `increase(camunda_x_total[1d] @ ${at})`,
    )
    // The hour before the window starts exactly at the retention edge: still retained.
    const edge = NOW_SECONDS - 30 * DAY_SECONDS + 3600 + DAY_SECONDS
    expect(increaseIn("camunda_x_total", { range: "1d", at: edge })).toContain("present_over_time")
    expect(increaseIn("camunda_x_total", { range: "1d", at: edge - 1 })).toBe(
      `increase(camunda_x_total[1d] @ ${edge - 1})`,
    )
  })

  it("refuses a range it cannot measure", () => {
    expect(() => increaseIn("camunda_x_total", { range: "1d12h" })).toThrow(/single-unit/)
  })
})

describe("rangeSeconds", () => {
  it("measures every single-unit PromQL duration", () => {
    expect(["30s", "5m", "2h", "1d", "1w"].map(rangeSeconds)).toEqual([
      30,
      300,
      7200,
      DAY_SECONDS,
      7 * DAY_SECONDS,
    ])
  })
})
