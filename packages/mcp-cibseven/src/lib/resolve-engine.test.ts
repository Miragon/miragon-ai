import { describe, it, expect } from "vitest"
import type { Client } from "@miragon-ai/client-cibseven"
import {
  createEngineRegistry,
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
 * Build the step appConfig with an injectable session id so sticky selection is
 * driven deterministically — the backend registry otherwise reads the in-flight
 * MCP request context, which doesn't exist in a unit test. The TTL/eviction and
 * per-session isolation mechanics themselves are the toolkit's concern (covered
 * by backend-registry.test.ts); here we pin the camunda7 adapter contract.
 */
function harness(engines: Array<{ id: string; baseUrl: string; cockpitUrl?: string }>) {
  let session: string | undefined
  const registry = createEngineRegistry(engines, (e) => ({ __engine: e.id }) as unknown as Client, {
    getSessionId: () => session,
  })
  const appConfig: Camunda7StepAppConfig = { registry, engines }
  return {
    appConfig,
    select: (id: string, sid = "s1") => {
      session = sid
      registry.backends.select(id)
    },
  }
}

describe("resolveStepEngine", () => {
  it("resolves the only engine (with its baseUrl) when one is configured and nothing is selected", () => {
    const { appConfig } = harness(SINGLE)
    const { client, engineId, baseUrl, cockpitUrl } = resolveStepEngine(appConfig)
    expect(engineId).toBe("default")
    expect(engineIdOf(client)).toBe("default")
    // Regression guard: the step must get a real client carrying a non-empty
    // baseUrl from the registry — never the dropped `appConfig.client`.
    expect(baseUrl).toBe("http://e1/engine-rest")
    expect(cockpitUrl).toBe("http://e1/cockpit")
  })

  it("honours the sticky session selection in a multi-engine setup", () => {
    const h = harness(MULTI)
    h.select("beta")
    const { client, engineId, baseUrl } = resolveStepEngine(h.appConfig)
    expect(engineId).toBe("beta")
    expect(engineIdOf(client)).toBe("beta")
    expect(baseUrl).toBe("http://beta/engine-rest")
  })

  it("lets an explicit override (the camunda7:engine view key) win over the sticky selection", () => {
    const h = harness(MULTI)
    h.select("beta")
    const { client, engineId, cockpitUrl } = resolveStepEngine(h.appConfig, "alpha")
    expect(engineId).toBe("alpha")
    expect(engineIdOf(client)).toBe("alpha")
    expect(cockpitUrl).toBe("http://alpha/cockpit")
  })

  it("throws a clear EngineNotSelectedError for multi-engine with no selection and no override", () => {
    const { appConfig } = harness(MULTI)
    expect(() => resolveStepEngine(appConfig)).toThrow(EngineNotSelectedError)
    // The message must name the selectable ids — the error path serialises
    // only code + message, so this is the LLM's one shot at seeing them.
    expect(() => resolveStepEngine(appConfig)).toThrow(
      'No engine selected for this session. Available engines: alpha, beta. Call camunda7_engine with action "select" first.',
    )
  })

  it("throws UnknownEngineError when the override names a non-existent engine", () => {
    const { appConfig } = harness(MULTI)
    expect(() => resolveStepEngine(appConfig, "gamma")).toThrow(UnknownEngineError)
  })
})
