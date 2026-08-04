import { describe, expect, it } from "vitest"
import { camunda7Module } from "./module.js"

/**
 * The engine id is a JOIN KEY against the metrics `engine_id` label, not a
 * display name — a mismatch makes every engine-scoped analytics query (BPMN
 * heatmap, engine compare) return empty instead of failing. These lock the
 * resolution so the shorthand path stays alignable with the engine's
 * `ENGINE_ID`.
 */
describe("camunda7Module.configFromEnv engine ids", () => {
  const enginesOf = (env: NodeJS.ProcessEnv) =>
    camunda7Module.configFromEnv(env).engines as Array<{ id: string; baseUrl: string }>

  it("names the CAMUNDA_BASE_URL shorthand engine after CAMUNDA_ENGINE_ID", () => {
    expect(
      enginesOf({
        CAMUNDA_BASE_URL: "http://engine.example/engine-rest",
        CAMUNDA_ENGINE_ID: "prod-a",
      }),
    ).toEqual([{ id: "prod-a", baseUrl: "http://engine.example/engine-rest" }])
  })

  it('falls back to "default" without CAMUNDA_ENGINE_ID, including the zero-config engine', () => {
    expect(enginesOf({ CAMUNDA_BASE_URL: "http://engine.example/engine-rest" })[0].id).toBe(
      "default",
    )
    expect(enginesOf({})).toEqual([{ id: "default", baseUrl: "http://localhost:8410/engine-rest" }])
    expect(enginesOf({ CAMUNDA_ENGINE_ID: "  " })[0].id).toBe("default")
  })

  it("applies CAMUNDA_ENGINE_ID to the zero-config engine too", () => {
    expect(enginesOf({ CAMUNDA_ENGINE_ID: "prod-a" })[0].id).toBe("prod-a")
  })

  it("ignores CAMUNDA_ENGINE_ID when the engine list is explicit", () => {
    expect(
      enginesOf({
        CAMUNDA_ENGINE_ID: "prod-a",
        CAMUNDA_ENGINES_JSON: '[{"id":"prod-b","baseUrl":"http://b.example/engine-rest"}]',
      }),
    ).toEqual([{ id: "prod-b", baseUrl: "http://b.example/engine-rest" }])
  })

  it("declares CAMUNDA_ENGINE_ID so the unknown-env-var warner does not flag it", () => {
    expect(camunda7Module.knownEnvVars).toContain("CAMUNDA_ENGINE_ID")
  })
})
