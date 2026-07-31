import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  ANONYMOUS_PROFILE_KEY,
  resolveAuthUserId,
  resolveProfileKey,
  withoutDefaults,
} from "./profile.js"

// Vitest runs without an mcp-use request context, so these tests cover the
// ctx-auth branch and the stdio fallback; the session-header branch is
// exercised on the wire by the app's e2e tests.
describe("resolveProfileKey", () => {
  it("prefers the authenticated user id from the handler ctx", () => {
    expect(resolveProfileKey({ auth: { user: { userId: "user-1" } } })).toBe("user-1")
  })

  it("ignores a non-string/empty auth user id", () => {
    expect(resolveProfileKey({ auth: { user: { userId: "" } } })).toBe(ANONYMOUS_PROFILE_KEY)
    expect(resolveProfileKey({ auth: { user: { userId: 42 } } })).toBe(ANONYMOUS_PROFILE_KEY)
  })

  it("maps 'no request context at all' (stdio, tests) to the shared anonymous record", () => {
    expect(resolveProfileKey()).toBe(ANONYMOUS_PROFILE_KEY)
    expect(resolveProfileKey(undefined)).toBe(ANONYMOUS_PROFILE_KEY)
  })
})

describe("resolveAuthUserId", () => {
  it("returns only the authenticated user id, never a fallback key", () => {
    expect(resolveAuthUserId({ auth: { user: { userId: "user-1" } } })).toBe("user-1")
    expect(resolveAuthUserId()).toBeUndefined()
    expect(resolveAuthUserId({ auth: {} })).toBeUndefined()
  })
})

describe("withoutDefaults", () => {
  const schema = z.object({
    period: z.enum(["7d", "30d"]).default("7d").describe("Look-back window."),
    limit: z.number().int().default(10),
    optional: z.string().optional(),
  })

  it("keeps omitted fields ABSENT instead of materializing defaults (the zod-4 partial trap)", () => {
    // The trap this guards: `schema.partial()` re-applies the defaults on parse.
    expect(schema.partial().parse({})).toEqual({ period: "7d", limit: 10 })

    const saveInput = z.object(withoutDefaults(schema.shape)).partial()
    expect(saveInput.parse({})).toEqual({})
    expect(saveInput.parse({ limit: 3 })).toEqual({ limit: 3 })
  })

  it("preserves each field's description (the model reads them at the tool boundary)", () => {
    const stripped = withoutDefaults(schema.shape)
    expect((stripped.period as z.ZodType).description).toBe("Look-back window.")
  })

  it("still validates the stripped fields", () => {
    const saveInput = z.object(withoutDefaults(schema.shape)).partial()
    expect(saveInput.safeParse({ period: "nope" }).success).toBe(false)
    expect(saveInput.safeParse({ period: "30d" }).success).toBe(true)
  })

  it("passes fields that carry no default through untouched", () => {
    const stripped = withoutDefaults(schema.shape)
    expect(stripped.optional).toBe(schema.shape.optional)
  })
})
