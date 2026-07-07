import { describe, expect, it } from "vitest"
import { createCamunda7Client } from "./client.js"

function headers(client: ReturnType<typeof createCamunda7Client>): Headers {
  return client.getConfig().headers as Headers
}

describe("createCamunda7Client", () => {
  it("sends Basic auth built from username/password", () => {
    const client = createCamunda7Client({
      baseUrl: "http://localhost:8410/engine-rest",
      authType: "basic",
      username: "demo",
      password: "secret",
    })
    expect(headers(client).get("Authorization")).toBe(
      `Basic ${Buffer.from("demo:secret").toString("base64")}`,
    )
  })

  it("sends Bearer auth from the configured token", () => {
    const client = createCamunda7Client({
      baseUrl: "http://localhost:8410/engine-rest",
      authType: "bearer",
      token: "tok-123",
    })
    expect(headers(client).get("Authorization")).toBe("Bearer tok-123")
  })

  it("omits the Authorization header for authType none and for incomplete credentials", () => {
    const none = createCamunda7Client({ baseUrl: "http://localhost:8410/engine-rest" })
    expect(headers(none).get("Authorization")).toBeNull()

    const incompleteBasic = createCamunda7Client({
      baseUrl: "http://localhost:8410/engine-rest",
      authType: "basic",
      username: "demo", // no password
    })
    expect(headers(incompleteBasic).get("Authorization")).toBeNull()

    const tokenlessBearer = createCamunda7Client({
      baseUrl: "http://localhost:8410/engine-rest",
      authType: "bearer",
    })
    expect(headers(tokenlessBearer).get("Authorization")).toBeNull()
  })

  it("passthrough: sets no static Authorization header", () => {
    const client = createCamunda7Client({
      baseUrl: "http://localhost:8410/engine-rest",
      authType: "passthrough",
      tokenProvider: () => "tok-123",
    })
    expect(headers(client).get("Authorization")).toBeNull()
  })

  it("passthrough: re-evaluates the token provider on every request", async () => {
    let currentToken: string | undefined = "tok-a"
    const seen: Array<string | null> = []
    const fetchStub: typeof fetch = async (input) => {
      seen.push((input as Request).headers.get("Authorization"))
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    const client = createCamunda7Client({
      baseUrl: "http://localhost:8410/engine-rest",
      authType: "passthrough",
      tokenProvider: () => currentToken,
    })

    await client.get({ url: "/engine", fetch: fetchStub })
    currentToken = "tok-b"
    await client.get({ url: "/engine", fetch: fetchStub })
    currentToken = undefined
    await client.get({ url: "/engine", fetch: fetchStub })

    expect(seen).toEqual(["Bearer tok-a", "Bearer tok-b", null])
  })

  it("passthrough: maps an engine 401 to an actionable error", async () => {
    const unauthorized: typeof fetch = async () => new Response(null, { status: 401 })

    const tokenless = createCamunda7Client({
      baseUrl: "http://localhost:8410/engine-rest",
      authType: "passthrough",
      tokenProvider: () => undefined,
    })
    await expect(tokenless.get({ url: "/engine", fetch: unauthorized })).rejects.toThrow(
      /no bearer token to pass through/,
    )

    const rejected = createCamunda7Client({
      baseUrl: "http://localhost:8410/engine-rest",
      authType: "passthrough",
      tokenProvider: () => "tok-123",
    })
    await expect(rejected.get({ url: "/engine", fetch: unauthorized })).rejects.toThrow(
      /rejected the forwarded bearer token/,
    )
  })

  it("passthrough: leaves the other request headers untouched", async () => {
    let seen: Headers | undefined
    const fetchStub: typeof fetch = async (input) => {
      seen = (input as Request).headers
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    const client = createCamunda7Client({
      baseUrl: "http://localhost:8410/engine-rest",
      authType: "passthrough",
      tokenProvider: () => "tok-123",
    })
    await client.get({ url: "/engine", fetch: fetchStub })
    expect(seen?.get("Accept")).toBe("application/json")
    expect(seen?.get("User-Agent")).toContain("@miragon-ai/client-cibseven")
  })

  it("always sends the JSON content negotiation headers and identifies itself", () => {
    const client = createCamunda7Client({ baseUrl: "http://localhost:8410/engine-rest" })
    const h = headers(client)
    expect(h.get("Content-Type")).toBe("application/json")
    expect(h.get("Accept")).toBe("application/json")
    expect(h.get("User-Agent")).toContain("@miragon-ai/client-cibseven")
  })

  it("normalizes a trailing slash off the base URL", () => {
    const client = createCamunda7Client({ baseUrl: "http://localhost:8410/engine-rest/" })
    expect(client.getConfig().baseUrl).toBe("http://localhost:8410/engine-rest")
  })
})
