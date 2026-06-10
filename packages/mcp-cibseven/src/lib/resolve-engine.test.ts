import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Client } from "@miragon-ai/client-cibseven"

// The sticky session selection reads the in-flight MCP request context, which
// doesn't exist in a unit test — mock it so each case controls it explicitly.
vi.mock("./engine-session.js", () => ({
  getSelectedEngine: vi.fn(() => undefined),
}))
import { getSelectedEngine } from "./engine-session.js"
import {
  resolveStepEngine,
  EngineNotSelectedError,
  UnknownEngineError,
  type EngineRegistry,
  type Camunda7StepAppConfig,
} from "./resolve-engine.js"

const mockedGetSelected = vi.mocked(getSelectedEngine)

/** Build the plugin appConfig the framework hands to a pipeline step. */
function appConfigFor(
  engines: Array<{ id: string; baseUrl: string; cockpitUrl?: string }>,
): Camunda7StepAppConfig {
  const registry: EngineRegistry = {
    engines,
    // Marker "client" per engine so we can assert which one was resolved.
    clients: new Map(engines.map((e) => [e.id, { __engine: e.id } as unknown as Client])),
    cockpitUrls: new Map(engines.map((e) => [e.id, e.cockpitUrl])),
  }
  return { registry, engines }
}

const engineIdOf = (client: Client): string => (client as unknown as { __engine: string }).__engine

const SINGLE = [
  { id: "default", baseUrl: "http://e1/engine-rest", cockpitUrl: "http://e1/cockpit" },
]
const MULTI = [
  { id: "alpha", baseUrl: "http://alpha/engine-rest", cockpitUrl: "http://alpha/cockpit" },
  { id: "beta", baseUrl: "http://beta/engine-rest" },
]

describe("resolveStepEngine", () => {
  beforeEach(() => {
    mockedGetSelected.mockReturnValue(undefined)
  })

  it("resolves the only engine (with its baseUrl) when one is configured and nothing is selected", () => {
    const { client, engineId, baseUrl, cockpitUrl } = resolveStepEngine(appConfigFor(SINGLE))
    expect(engineId).toBe("default")
    expect(engineIdOf(client)).toBe("default")
    // Regression guard: the step must get a real client carrying a non-empty
    // baseUrl from the registry — never the dropped `appConfig.client`.
    expect(baseUrl).toBe("http://e1/engine-rest")
    expect(cockpitUrl).toBe("http://e1/cockpit")
  })

  it("honours the sticky session selection in a multi-engine setup", () => {
    mockedGetSelected.mockReturnValue("beta")
    const { client, engineId, baseUrl } = resolveStepEngine(appConfigFor(MULTI))
    expect(engineId).toBe("beta")
    expect(engineIdOf(client)).toBe("beta")
    expect(baseUrl).toBe("http://beta/engine-rest")
  })

  it("lets an explicit override (the camunda7:engine view key) win over the sticky selection", () => {
    mockedGetSelected.mockReturnValue("beta")
    const { client, engineId, cockpitUrl } = resolveStepEngine(appConfigFor(MULTI), "alpha")
    expect(engineId).toBe("alpha")
    expect(engineIdOf(client)).toBe("alpha")
    expect(cockpitUrl).toBe("http://alpha/cockpit")
  })

  it("throws a clear EngineNotSelectedError for multi-engine with no selection and no override", () => {
    expect(() => resolveStepEngine(appConfigFor(MULTI))).toThrow(EngineNotSelectedError)
    // The message must name the selectable ids — the error path serialises
    // only code + message, so this is the LLM's one shot at seeing them.
    expect(() => resolveStepEngine(appConfigFor(MULTI))).toThrow(
      'No engine selected for this session. Available engines: alpha, beta. Call camunda7_engine with action "select" first.',
    )
  })

  it("throws UnknownEngineError when the override names a non-existent engine", () => {
    expect(() => resolveStepEngine(appConfigFor(MULTI), "gamma")).toThrow(UnknownEngineError)
  })
})
