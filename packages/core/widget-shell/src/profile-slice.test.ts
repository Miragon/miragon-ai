import { describe, expect, it } from "vitest"
import { mergeRawSlice, requireProfileKey } from "./profile-slice.js"
import { runWithMcpRequestInfo } from "./request-context.js"
import type { ProfileSource } from "./profile.js"

describe("requireProfileKey", () => {
  it("resolves the anonymous key without any request context (stdio/tests)", () => {
    expect(requireProfileKey()).toBe("anonymous")
  })

  it("resolves the auth user id when the request carries one", () => {
    expect(runWithMcpRequestInfo({ authUserId: "user-7" }, () => requireProfileKey())).toBe(
      "user-7",
    )
  })

  it("refuses an identity-less HTTP request with the operator-actionable error", () => {
    expect(() => runWithMcpRequestInfo({}, () => requireProfileKey())).toThrow(/MCP_OAUTH/)
  })
})

describe("mergeRawSlice", () => {
  const storeWith = (modules?: Record<string, unknown>): ProfileSource => ({
    get: () => Promise.resolve({ modules }),
  })

  it("merges the patch over the RAW stored slice, preserving unknown fields", async () => {
    const store = storeWith({ notes: { sortOrder: "asc", futureField: 42 } })
    expect(await mergeRawSlice(store, "k", "notes", { sortOrder: "desc" })).toEqual({
      sortOrder: "desc",
      futureField: 42,
    })
  })

  it("treats an absent or non-object slice as empty", async () => {
    expect(await mergeRawSlice(storeWith(undefined), "k", "notes", { a: 1 })).toEqual({ a: 1 })
    expect(await mergeRawSlice(storeWith({ notes: "garbage" }), "k", "notes", { a: 1 })).toEqual({
      a: 1,
    })
  })

  it("never reads a foreign module's slice", async () => {
    const store = storeWith({ other: { x: 1 } })
    expect(await mergeRawSlice(store, "k", "notes", {})).toEqual({})
  })
})
