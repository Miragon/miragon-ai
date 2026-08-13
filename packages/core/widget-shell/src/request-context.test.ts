import { describe, expect, it } from "vitest"
import {
  getMcpRequestInfo,
  installMcpRequestContext,
  runWithMcpRequestInfo,
  type McpMiddlewareHost,
} from "./request-context.js"

type Middleware = (ctx: unknown, next: () => Promise<void>) => Promise<void>

/** Minimal server double capturing what `installMcpRequestContext` registers. */
function fakeServer() {
  const middlewares: Middleware[] = []
  const server: McpMiddlewareHost = {
    use: (_pattern, fn) => {
      middlewares.push(fn)
      return server
    },
  }
  return { server, middlewares }
}

describe("runWithMcpRequestInfo / getMcpRequestInfo", () => {
  it("is undefined outside a request", () => {
    expect(getMcpRequestInfo()).toBeUndefined()
  })

  it("exposes the info inside the run scope only", () => {
    const inside = runWithMcpRequestInfo({ sessionId: "s-1" }, () => getMcpRequestInfo())
    expect(inside).toEqual({ sessionId: "s-1" })
    expect(getMcpRequestInfo()).toBeUndefined()
  })
})

describe("installMcpRequestContext", () => {
  it("registers exactly one middleware, even when installed twice", () => {
    const { server, middlewares } = fakeServer()
    installMcpRequestContext(server)
    installMcpRequestContext(server)
    expect(middlewares).toHaveLength(1)
  })

  it("derives session id, auth user and authorization for downstream handlers", async () => {
    const { server, middlewares } = fakeServer()
    installMcpRequestContext(server)
    const headers: Record<string, string> = { Authorization: "Bearer tok-123" }
    const ctx = {
      request: { header: (name: string) => headers[name] },
      session: { sessionId: "sess-9" },
      auth: { token: "tok-123", extra: { user: { userId: "user-7" } } },
    }
    let seen: unknown
    await middlewares[0](ctx, async () => {
      seen = getMcpRequestInfo()
    })
    expect(seen).toEqual({
      sessionId: "sess-9",
      authUserId: "user-7",
      authorization: "Bearer tok-123",
    })
  })

  it("falls back to the Mcp-Session-Id header and tolerates a missing auth", async () => {
    const { server, middlewares } = fakeServer()
    installMcpRequestContext(server)
    const headers: Record<string, string> = { "mcp-session-id": "sess-h" }
    const ctx = { request: { header: (name: string) => headers[name] } }
    let seen: unknown
    await middlewares[0](ctx, async () => {
      seen = getMcpRequestInfo()
    })
    expect(seen).toEqual({ sessionId: "sess-h", authUserId: undefined, authorization: undefined })
  })

  it("leaves the store EMPTY for non-HTTP transports (stdio → anonymous-profile signal)", async () => {
    const { server, middlewares } = fakeServer()
    installMcpRequestContext(server)
    let seen: unknown = "sentinel"
    await middlewares[0]({}, async () => {
      seen = getMcpRequestInfo()
    })
    expect(seen).toBeUndefined()
  })

  it("ignores a non-string auth user id and a throwing header accessor", async () => {
    const { server, middlewares } = fakeServer()
    installMcpRequestContext(server)
    const ctx = {
      request: {
        header: () => {
          throw new Error("no request")
        },
      },
      auth: { extra: { user: { userId: 42 } } },
    }
    let seen: unknown
    await middlewares[0](ctx, async () => {
      seen = getMcpRequestInfo()
    })
    expect(seen).toEqual({ sessionId: undefined, authUserId: undefined, authorization: undefined })
  })
})
