import { describe, expect, it } from "vitest"
import { runWithContext } from "mcp-use/server"
import { resolveMcpBearerToken } from "./mcp-auth.js"

/**
 * Minimal stand-in for the Hono context mcp-use stores in its
 * AsyncLocalStorage — [[resolveMcpBearerToken]] only touches `req.header()`.
 */
function fakeContext(headers: Record<string, string>) {
  const lookup = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    req: { header: (name: string) => lookup[name.toLowerCase()] },
  } as unknown as Parameters<typeof runWithContext>[0]
}

function resolveUnder(headers: Record<string, string>): Promise<string | undefined> {
  return runWithContext(fakeContext(headers), async () => resolveMcpBearerToken())
}

describe("resolveMcpBearerToken", () => {
  it("returns undefined outside any request context (stdio, boot)", () => {
    expect(resolveMcpBearerToken()).toBeUndefined()
  })

  it("extracts the bearer token from the Authorization header", async () => {
    await expect(resolveUnder({ Authorization: "Bearer tok-123" })).resolves.toBe("tok-123")
  })

  it("matches the Bearer scheme case-insensitively", async () => {
    await expect(resolveUnder({ Authorization: "bearer tok-123" })).resolves.toBe("tok-123")
  })

  it("returns undefined without an Authorization header", async () => {
    await expect(resolveUnder({})).resolves.toBeUndefined()
  })

  it("ignores non-Bearer schemes instead of forwarding them", async () => {
    await expect(resolveUnder({ Authorization: "Basic ZGVtbzpkZW1v" })).resolves.toBeUndefined()
  })

  it("ignores a bare scheme without a token", async () => {
    await expect(resolveUnder({ Authorization: "Bearer " })).resolves.toBeUndefined()
  })
})
