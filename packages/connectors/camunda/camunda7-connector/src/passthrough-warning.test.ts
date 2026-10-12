import { describe, expect, it } from "vitest"
import { camunda7Module } from "./module.js"

/**
 * Passthrough forwards the caller's MCP token to the engine — the MCP auth
 * spec's forbidden token passthrough. It stays for trusted single-audience
 * setups (#330), and the boot says so for exactly the engines that use it.
 */
describe("camunda7Module.bootWarnings — passthrough", () => {
  const passthroughWarning = (env: NodeJS.ProcessEnv) =>
    camunda7Module.bootWarnings(env).filter((w) => w.startsWith("Passthrough auth"))

  it("names the shorthand engine when CAMUNDA_AUTH_TYPE=passthrough", () => {
    const [warning] = passthroughWarning({
      CAMUNDA_BASE_URL: "http://engine.example/engine-rest",
      CAMUNDA_ENGINE_ID: "prod-a",
      CAMUNDA_AUTH_TYPE: "passthrough",
    })
    expect(warning).toContain('"prod-a"')
    expect(warning).toContain("trusted single-audience setup")
    expect(warning).toContain("replay")
  })

  it("names only the engines whose own or fallback auth is passthrough", () => {
    const engines = [
      { id: "a", baseUrl: "http://a.example/engine-rest", auth: { type: "passthrough" } },
      {
        id: "b",
        baseUrl: "http://b.example/engine-rest",
        auth: { type: "basic", username: "u", password: "p" },
      },
      { id: "c", baseUrl: "http://c.example/engine-rest" },
    ]
    const own = passthroughWarning({ CAMUNDA_ENGINES_JSON: JSON.stringify(engines) })
    expect(own).toHaveLength(1)
    expect(own[0]).toContain('on "a":')
    const fallback = passthroughWarning({
      CAMUNDA_ENGINES_JSON: JSON.stringify(engines),
      CAMUNDA_AUTH_TYPE: "passthrough",
    })
    expect(fallback[0]).toContain('on "a", "c":')
  })

  it("stays silent without passthrough and on a config the boot rejects anyway", () => {
    expect(
      passthroughWarning({ CAMUNDA_BASE_URL: "http://e.example", CAMUNDA_AUTH_TYPE: "basic" }),
    ).toEqual([])
    expect(
      passthroughWarning({ CAMUNDA_ENGINES_JSON: "{not json", CAMUNDA_AUTH_TYPE: "passthrough" }),
    ).toEqual([])
  })
})
