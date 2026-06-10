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
