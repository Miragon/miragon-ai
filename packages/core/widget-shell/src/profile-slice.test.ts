import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import {
  mergeRawSlice,
  parseModuleSlice,
  requireProfileKey,
  saveModuleSlice,
} from "./profile-slice.js"
import { runWithMcpRequestInfo } from "./request-context.js"
import type { ProfileSource } from "./profile.js"

describe("requireProfileKey", () => {
  it("resolves the anonymous key for an explicitly declared local caller", () => {
    expect(runWithMcpRequestInfo({ anonymousCaller: true }, () => requireProfileKey())).toBe(
      "anonymous",
    )
  })

  it("resolves the auth user id when the request carries one", () => {
    expect(runWithMcpRequestInfo({ authUserId: "user-7" }, () => requireProfileKey())).toBe(
      "user-7",
    )
  })

  it("refuses an identity-less HTTP request with the operator-actionable error", () => {
    expect(() => runWithMcpRequestInfo({}, () => requireProfileKey())).toThrow(
      "No caller identity to save the profile under — settings are saved per signed-in user, so the server needs MCP_OAUTH.",
    )
  })

  it("refuses without any request context (a missing middleware install) — never 'anonymous'", () => {
    expect(() => requireProfileKey()).toThrow(/No caller identity/)
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

describe("saveModuleSlice", () => {
  it("hands the store the patch alone and reports the slice off the saved record", async () => {
    const save = vi.fn<NonNullable<ProfileSource["save"]>>(() =>
      Promise.resolve({ modules: { notes: { sortOrder: "desc", futureField: 42 } } }),
    )
    const get = vi.fn<ProfileSource["get"]>()
    const slice = await saveModuleSlice(
      { get, save },
      "k",
      "notes",
      { sortOrder: "desc" },
      {
        userId: "user-7",
      },
    )
    expect(save).toHaveBeenCalledWith(
      "k",
      { modules: { notes: { sortOrder: "desc" } } },
      { userId: "user-7" },
    )
    // No pre-read: a slice read outside the store's lock would be stale.
    expect(get).not.toHaveBeenCalled()
    expect(slice).toEqual({ sortOrder: "desc", futureField: 42 })
  })

  it("reads the slice back when a custom store's save returns nothing", async () => {
    const save = vi.fn<NonNullable<ProfileSource["save"]>>(() => Promise.resolve(undefined))
    const get = vi.fn<ProfileSource["get"]>(() =>
      Promise.resolve({ modules: { notes: { sortOrder: "asc" } } }),
    )
    expect(await saveModuleSlice({ get, save }, "k", "notes", { sortOrder: "asc" })).toEqual({
      sortOrder: "asc",
    })
    expect(get).toHaveBeenCalledWith("k")
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
