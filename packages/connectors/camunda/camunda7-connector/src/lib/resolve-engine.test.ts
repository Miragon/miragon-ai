import { describe, it, expect, vi } from "vitest"
import type { Client } from "@miragon-ai/camunda7-client"
import {
  createEngineRegistry,
  resolveEngine,
  resolveStepEngine,
  EngineNotSelectedError,
  UnknownEngineError,
  type Camunda7StepAppConfig,
} from "./resolve-engine.js"

const engineIdOf = (client: Client): string => (client as unknown as { __engine: string }).__engine

const SINGLE = [
  { id: "default", baseUrl: "http://e1/engine-rest", cockpitUrl: "http://e1/cockpit" },
]
const MULTI = [
  { id: "alpha", baseUrl: "http://alpha/engine-rest", cockpitUrl: "http://alpha/cockpit" },
  { id: "beta", baseUrl: "http://beta/engine-rest" },
]

/**
 * Build the step appConfig with an injectable default-engine lookup — the seam
 * production wires to the profile store (`profileDefaultEngineId`). The
 * profile plumbing itself (identity, allow-list) is covered by
 * `engine-preferences` via the engines-tool tests; here we pin the camunda7
 * resolution contract: override > saved default > single configured engine.
 */
function harness(
  engines: Array<{ id: string; baseUrl: string; cockpitUrl?: string }>,
  defaultEngineId?: () => Promise<string | undefined>,
) {
  const registry = createEngineRegistry(engines, (e) => ({ __engine: e.id }) as unknown as Client, {
    defaultEngineId,
  })
  const appConfig: Camunda7StepAppConfig = { registry, engines }
  return { appConfig, registry }
}

describe("resolveStepEngine", () => {
  it("resolves the only engine (with its baseUrl) when one is configured and no default is saved", async () => {
    const { appConfig } = harness(SINGLE)
    const { client, engineId, baseUrl, cockpitUrl } = await resolveStepEngine(appConfig)
    expect(engineId).toBe("default")
    expect(engineIdOf(client)).toBe("default")
    // Regression guard: the step must get a real client carrying a non-empty
    // baseUrl from the registry — never the dropped `appConfig.client`.
    expect(baseUrl).toBe("http://e1/engine-rest")
    expect(cockpitUrl).toBe("http://e1/cockpit")
  })

  it("honours the saved default engine in a multi-engine setup", async () => {
    const { appConfig } = harness(MULTI, () => Promise.resolve("beta"))
    const { client, engineId, baseUrl } = await resolveStepEngine(appConfig)
    expect(engineId).toBe("beta")
    expect(engineIdOf(client)).toBe("beta")
    expect(baseUrl).toBe("http://beta/engine-rest")
  })

  it("lets an explicit override (the camunda7:engine view key) win over the saved default", async () => {
    const lookup = vi.fn(() => Promise.resolve("beta"))
    const { appConfig } = harness(MULTI, lookup)
    const { client, engineId, cockpitUrl } = await resolveStepEngine(appConfig, "alpha")
    expect(engineId).toBe("alpha")
    expect(engineIdOf(client)).toBe("alpha")
    expect(cockpitUrl).toBe("http://alpha/cockpit")
    // An explicit override must not even consult the profile — the lookup is
    // a per-call store read that would be pure waste here.
    expect(lookup).not.toHaveBeenCalled()
  })

  it("throws a clear EngineNotSelectedError for multi-engine with no default and no override", async () => {
    const { appConfig } = harness(MULTI)
    await expect(resolveStepEngine(appConfig)).rejects.toThrow(EngineNotSelectedError)
    // The message must name the selectable ids — the error path serialises
    // only code + message, so this is the LLM's one shot at seeing them.
    await expect(resolveStepEngine(appConfig)).rejects.toThrow(
      'No engine specified and no default engine saved. Available engines: alpha, beta. Pass the per-call `engine` parameter, or save a default with camunda7_engine action "select".',
    )
  })

  it("throws UnknownEngineError when the override names a non-existent engine", async () => {
    const { appConfig } = harness(MULTI)
    await expect(resolveStepEngine(appConfig, "gamma")).rejects.toThrow(UnknownEngineError)
  })
})

describe("saved-default validation", () => {
  it("ignores a stale saved default that names a no-longer-configured engine", async () => {
    // A removed engine must degrade to "no default" (NotSelected with the
    // real ids), never fail every call with UnknownEngineError.
    const { registry } = harness(MULTI, () => Promise.resolve("gone"))
    await expect(resolveEngine(undefined, registry)).rejects.toThrow(EngineNotSelectedError)
  })

  it("falls back to the sole configured engine when the saved default is stale", async () => {
    const { registry } = harness(SINGLE, () => Promise.resolve("gone"))
    const { engineId } = await resolveEngine(undefined, registry)
    expect(engineId).toBe("default")
  })

  it("resolves without any default lookup wired (tests, minimal registries)", async () => {
    const registry = createEngineRegistry(SINGLE, (e) => ({ __engine: e.id }) as unknown as Client)
    const { engineId } = await resolveEngine(undefined, registry)
    expect(engineId).toBe("default")
  })
})
