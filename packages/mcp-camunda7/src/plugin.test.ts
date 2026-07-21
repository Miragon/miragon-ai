import { describe, expect, it } from "vitest"
import type { Client } from "@miragon-ai/client-camunda7"
import { createPlugin } from "./plugin.js"
import { resolveEngine, type Camunda7StepAppConfig } from "./lib/resolve-engine.js"

function authHeader(client: Client): string | null {
  return (client.getConfig().headers as Headers).get("Authorization")
}

describe("createPlugin per-engine auth", () => {
  it("builds each engine's client from its own auth, falling back to the module-wide config", () => {
    const plugin = createPlugin({
      engines: [
        { id: "a", baseUrl: "http://a.example/engine-rest" },
        {
          id: "b",
          baseUrl: "http://b.example/engine-rest",
          auth: { type: "bearer", token: "tok-b" },
        },
        { id: "c", baseUrl: "http://c.example/engine-rest", auth: { type: "none" } },
      ],
      authType: "basic",
      username: "demo",
      password: "secret",
    })
    const { registry } = plugin.appConfig as unknown as Camunda7StepAppConfig

    expect(authHeader(resolveEngine("a", registry).client)).toBe(
      `Basic ${Buffer.from("demo:secret").toString("base64")}`,
    )
    expect(authHeader(resolveEngine("b", registry).client)).toBe("Bearer tok-b")
    expect(authHeader(resolveEngine("c", registry).client)).toBeNull()
  })

  it("does not mix per-engine auth fields with the module-wide credentials", () => {
    const plugin = createPlugin({
      engines: [
        // Declares its own auth but no token — must NOT inherit the global
        // basic credentials and must send no Authorization header at all.
        { id: "solo", baseUrl: "http://solo.example/engine-rest", auth: { type: "bearer" } },
      ],
      authType: "basic",
      username: "demo",
      password: "secret",
    })
    const { registry } = plugin.appConfig as unknown as Camunda7StepAppConfig

    expect(authHeader(resolveEngine("solo", registry).client)).toBeNull()
  })
})
