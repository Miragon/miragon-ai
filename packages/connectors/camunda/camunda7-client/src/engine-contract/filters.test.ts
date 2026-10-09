import { describe, expect, it } from "vitest"
import { complementaryFlags, engineKeyList, engineLike, trueOnly } from "./filters.js"

describe("trueOnly — the engine ignores a false flag, so it is never sent", () => {
  it("keeps true and drops false and absent", () => {
    expect(trueOnly(true)).toBe(true)
    expect(trueOnly(false)).toBeUndefined()
    expect(trueOnly(undefined)).toBeUndefined()
  })
})

describe("complementaryFlags — false is sent as true on the complement", () => {
  const pair = (flags: { active?: boolean; suspended?: boolean }) =>
    complementaryFlags(flags, "active", "suspended")

  it("sends a true flag as is", () => {
    expect(pair({ active: true })).toEqual({ active: true })
    expect(pair({ suspended: true })).toEqual({ suspended: true })
  })

  it("maps false onto the complement instead of forwarding it", () => {
    expect(pair({ suspended: false })).toEqual({ active: true })
    expect(pair({ active: false })).toEqual({ suspended: true })
  })

  it("sends nothing without flags and agrees with itself", () => {
    expect(pair({})).toEqual({})
    expect(pair({ active: true, suspended: false })).toEqual({ active: true })
  })

  it("asks for neither state when both are false", () => {
    expect(pair({ active: false, suspended: false })).toEqual({ active: true, suspended: true })
  })
})

describe("engineLike — a LIKE value without a wildcard would match exactly", () => {
  it("wraps a plain value into a substring match", () => {
    expect(engineLike("invoice")).toBe("%invoice%")
  })

  it("keeps a value that already carries a wildcard", () => {
    expect(engineLike("inv%")).toBe("inv%")
    expect(engineLike("%")).toBe("%")
  })

  it("sends nothing for an empty or absent value", () => {
    expect(engineLike("")).toBeUndefined()
    expect(engineLike(undefined)).toBeUndefined()
  })
})

describe("engineKeyList — single and list inputs become one comma list", () => {
  it("joins and de-duplicates", () => {
    expect(engineKeyList("a", ["b", "a", "c"])).toBe("a,b,c")
  })

  it("skips empty parts and sends nothing when all are empty", () => {
    expect(engineKeyList(undefined, ["", "b"])).toBe("b")
    expect(engineKeyList(undefined, [])).toBeUndefined()
    expect(engineKeyList()).toBeUndefined()
  })
})
