import { describe, expect, it } from "vitest"
import { z } from "zod"
import { mergeRawSlice, parseModuleSlice, requireProfileKey } from "./profile-slice.js"
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

describe("parseModuleSlice", () => {
  const schema = z.object({
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
    pageSize: z.number().int().min(1).optional(),
    tags: z.array(z.string()).default([]),
  })

  it("parses a valid slice and applies defaults for absent fields", () => {
    expect(parseModuleSlice(schema, { pageSize: 25 })).toEqual({
      sortOrder: "asc",
      pageSize: 25,
      tags: [],
    })
  })

  it("degrades absent and garbage slices to the full defaults", () => {
    const defaults = { sortOrder: "asc", tags: [] }
    expect(parseModuleSlice(schema, undefined)).toEqual(defaults)
    expect(parseModuleSlice(schema, "garbage")).toEqual(defaults)
    expect(parseModuleSlice(schema, 42)).toEqual(defaults)
  })

  it("recovers per FIELD: one invalid value keeps every other saved preference", () => {
    // The failure mode this guards: a newer build writes a value this build's
    // schema rejects; resetting the WHOLE slice would silently drop unrelated
    // preferences (e.g. engine curation next to a bad preferredRole).
    expect(
      parseModuleSlice(schema, { sortOrder: "newest-first", pageSize: 25, tags: ["a"] }),
    ).toEqual({ sortOrder: "asc", pageSize: 25, tags: ["a"] })
  })

  it("keeps unknown fields out of the view (storage preservation is mergeRawSlice's job)", () => {
    expect(parseModuleSlice(schema, { pageSize: 5, futureField: 42 })).toEqual({
      sortOrder: "asc",
      pageSize: 5,
      tags: [],
    })
  })
})
