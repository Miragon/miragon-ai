import { describe, expect, it } from "vitest"
import { runWithMcpRequestInfo } from "@miragon-ai/widget-shell/server"
import { resolveMcpBearerToken } from "./mcp-auth.js"

/**
 * [[resolveMcpBearerToken]] reads the raw `Authorization` header value off the
 * repo-owned ambient request info — `runWithMcpRequestInfo` is that store's
 * test seam (mirrors mcp-use 1.x `runWithContext`).
 */
function resolveUnder(authorization?: string): string | undefined {
  return runWithMcpRequestInfo(authorization ? { authorization } : {}, () =>
    resolveMcpBearerToken(),
  )
}

describe("resolveMcpBearerToken", () => {
  it("returns undefined outside any request context (stdio, boot)", () => {
    expect(resolveMcpBearerToken()).toBeUndefined()
  })

  it("extracts the bearer token from the Authorization header", () => {
    expect(resolveUnder("Bearer tok-123")).toBe("tok-123")
  })

  it("matches the Bearer scheme case-insensitively", () => {
    expect(resolveUnder("bearer tok-123")).toBe("tok-123")
  })

  it("returns undefined without an Authorization header", () => {
    expect(resolveUnder()).toBeUndefined()
  })

  it("ignores non-Bearer schemes instead of forwarding them", () => {
    expect(resolveUnder("Basic ZGVtbzpkZW1v")).toBeUndefined()
  })

  it("ignores a bare scheme without a token", () => {
    expect(resolveUnder("Bearer ")).toBeUndefined()
  })
})
