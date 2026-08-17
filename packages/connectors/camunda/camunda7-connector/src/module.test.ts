import { describe, expect, it } from "vitest"
import { camunda7Module, camunda7ConfigSchema } from "./module.js"

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

/**
 * The zero-config fallback is the nastiest first-run state: it reaches the
 * Compose engine, so BPM tools WORK while engine-scoped analytics silently
 * return empty (engine id "default" vs the stamped "prod-a"). The boot warning
 * is the only signal — it must fire exactly when nothing configures an engine.
 */
describe("camunda7Module.bootWarnings", () => {
  it("warns on a fully unconfigured environment, naming the fallback URL and id", () => {
    const warnings = camunda7Module.bootWarnings({})
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("http://localhost:8410/engine-rest")
    expect(warnings[0]).toContain('engine id "default"')
    expect(warnings[0]).toContain("CAMUNDA_ENGINE_ID")
  })

  it("names the CAMUNDA_ENGINE_ID override in the warning when only the id is set", () => {
    expect(camunda7Module.bootWarnings({ CAMUNDA_ENGINE_ID: "prod-a" })[0]).toContain(
      'engine id "prod-a"',
    )
  })

  it.each([
    { CAMUNDA_BASE_URL: "http://engine.example/engine-rest" },
    { CAMUNDA_ENGINES_JSON: '[{"id":"a","baseUrl":"http://a.example/engine-rest"}]' },
    { CAMUNDA_ENGINES_FILE: "/etc/engines.json" },
  ])("stays silent when an engine source is configured (%o)", (env) => {
    expect(camunda7Module.bootWarnings(env)).toEqual([])
  })

  it("treats whitespace-only values as unset", () => {
    expect(camunda7Module.bootWarnings({ CAMUNDA_BASE_URL: "  " })).toHaveLength(1)
  })
})

describe("camunda7Module.configFromEnv passthrough", () => {
  it("maps the auth and repo env vars verbatim", () => {
    expect(
      camunda7Module.configFromEnv({
        CAMUNDA_AUTH_TYPE: "basic",
        CAMUNDA_USERNAME: "u",
        CAMUNDA_PASSWORD: "p",
        CAMUNDA_TOKEN: "t",
        CAMUNDA_INCIDENT_ISSUE_REPO: "acme/procs",
      }),
    ).toMatchObject({
      authType: "basic",
      username: "u",
      password: "p",
      token: "t",
      incidentIssueRepository: "acme/procs",
    })
  })

  it("forwards healthThresholds only when one of the vars is set", () => {
    expect(camunda7Module.configFromEnv({})).not.toHaveProperty("healthThresholds")
    expect(camunda7Module.configFromEnv({ CAMUNDA_HEALTH_CRITICAL_INCIDENTS: "9" })).toMatchObject({
      healthThresholds: { criticalIncidents: "9" },
    })
    expect(
      camunda7Module.configFromEnv({ CAMUNDA_HEALTH_CRITICAL_CLUSTER_SIZE: "4" }),
    ).toMatchObject({ healthThresholds: { criticalClusterSize: "4" } })
  })
})

/**
 * Incomplete credentials must fail the boot, not silently degrade to
 * unauthenticated engine requests — these lock the schema refinements.
 */
describe("camunda7ConfigSchema auth validation", () => {
  const engine = { id: "prod-a", baseUrl: "http://engine.example/engine-rest" }

  it("accepts complete basic/bearer credentials", () => {
    expect(() =>
      camunda7ConfigSchema.parse({
        engines: [engine],
        authType: "basic",
        username: "u",
        password: "p",
      }),
    ).not.toThrow()
    expect(() =>
      camunda7ConfigSchema.parse({ engines: [engine], authType: "bearer", token: "t" }),
    ).not.toThrow()
  })

  it("rejects basic without credentials and bearer without token, naming the vars", () => {
    expect(() => camunda7ConfigSchema.parse({ engines: [engine], authType: "basic" })).toThrow(
      /CAMUNDA_USERNAME and CAMUNDA_PASSWORD/,
    )
    expect(() => camunda7ConfigSchema.parse({ engines: [engine], authType: "bearer" })).toThrow(
      /CAMUNDA_TOKEN/,
    )
  })

  it("lets per-engine auth stand in for missing global credentials", () => {
    const withAuth = { ...engine, auth: { type: "none" as const } }
    expect(() =>
      camunda7ConfigSchema.parse({ engines: [withAuth], authType: "basic" }),
    ).not.toThrow()
  })

  it("rejects engine ids that break the metrics-label contract", () => {
    expect(() => camunda7ConfigSchema.parse({ engines: [{ ...engine, id: "Prod A" }] })).toThrow(
      /lowercase/,
    )
  })
})
