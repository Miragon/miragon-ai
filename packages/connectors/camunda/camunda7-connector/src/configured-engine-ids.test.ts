import { describe, expect, it } from "vitest"
import { camunda7Module } from "./module.js"
import { configuredEngineIds } from "./configured-engine-ids.js"

/** The fleet analytics is scoped to (#336): exactly the configured ids, in order. */
describe("configuredEngineIds", () => {
  it("hands every configured engine id to other modules, in configuration order", () => {
    const config = camunda7Module.configFromEnv({
      CAMUNDA_ENGINES_JSON:
        '{"prod":[{"id":"prod-a","baseUrl":"http://a.example/engine-rest"},{"id":"prod-b","baseUrl":"http://b.example/engine-rest"}]}',
    })
    expect(configuredEngineIds(config)).toEqual(["prod-a", "prod-b"])
  })

  it("covers the single-engine shorthand under its CAMUNDA_ENGINE_ID", () => {
    const config = camunda7Module.configFromEnv({ CAMUNDA_ENGINE_ID: "prod-a" })
    expect(configuredEngineIds(config)).toEqual(["prod-a"])
  })
})
