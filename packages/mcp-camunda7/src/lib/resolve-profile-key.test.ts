import { describe, expect, it } from "vitest"
import {
  ANONYMOUS_PROFILE_KEY,
  resolveAuthUserId,
  resolveProfileKey,
} from "./resolve-profile-key.js"

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
