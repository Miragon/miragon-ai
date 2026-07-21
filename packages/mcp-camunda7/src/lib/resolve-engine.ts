import {
  BackendNotSelectedError,
  UnknownBackendError,
  createBackendRegistry,
  type BackendRegistry,
} from "@miragon/mcp-toolkit-core/tools"
import type { Camunda7AuthType, Client } from "@miragon-ai/client-camunda7"

/**
 * Per-engine auth override. An engine that carries one is authenticated with
 * exactly these fields; engines without one fall back to the module-wide
 * config ([[Camunda7PluginConfig]]) — the two are never mixed field-by-field.
 */
export interface EngineAuth {
  type: Camunda7AuthType
  username?: string
  password?: string
  token?: string
}

export interface EngineEntry {
  id: string
  baseUrl: string
  cockpitUrl?: string
  auth?: EngineAuth
}

/** Per-engine metadata carried on each backend-registry entry. */
export interface EngineMeta {
  baseUrl: string
  cockpitUrl?: string
}

/**
 * Session-aware engine routing for the camunda7 module. Wraps the toolkit's
 * generic {@link BackendRegistry} — the single source of truth for the
 * per-session engine selection (override > sticky > single-default precedence,
 * lazy-TTL eviction, session id read from the MCP request context) — alongside
 * the static configured engine list for listing and the cockpit-count reads.
 */
export interface EngineRegistry {
  backends: BackendRegistry<Client, EngineMeta>
  engines: EngineEntry[]
}

/**
 * Builds an {@link EngineRegistry} from the configured engines and a factory
 * that creates the REST client for each. `opts` is a test seam mirroring the
 * toolkit registry's injectable session/clock; production callers omit it.
 */
export function createEngineRegistry(
  engines: EngineEntry[],
  clientFor: (engine: EngineEntry) => Client,
  opts?: { getSessionId?: () => string | undefined; now?: () => number },
): EngineRegistry {
  const backends = createBackendRegistry<Client, EngineMeta>(
    engines.map((e) => ({
      id: e.id,
      client: clientFor(e),
      meta: { baseUrl: e.baseUrl, cockpitUrl: e.cockpitUrl },
    })),
    { label: "engine", ...opts },
  )
  return { backends, engines }
}

/**
 * Thrown when an operations tool is invoked but no engine has been selected
 * for the current MCP session and the registry holds more than one engine.
 *
 * The message lists the available engine ids because the error path only
 * serialises code + message (the structured `availableEngines` field never
 * reaches the model) — naming them here saves the LLM a
 * `camunda7_engine` (action "list") roundtrip before it can pick one and
 * select it.
 */
export class EngineNotSelectedError extends Error {
  readonly code = "ENGINE_NOT_SELECTED" as const
  readonly availableEngines: EngineEntry[]
  constructor(availableEngines: EngineEntry[]) {
    super(
      `No engine selected for this session. Available engines: ${availableEngines
        .map((e) => e.id)
        .join(", ")}. Call camunda7_engine with action "select" first.`,
    )
    this.name = "EngineNotSelectedError"
    this.availableEngines = availableEngines
  }
}

export class UnknownEngineError extends Error {
  readonly code = "UNKNOWN_ENGINE" as const
  readonly requestedEngine: string
  readonly availableEngines: EngineEntry[]
  constructor(requestedEngine: string, availableEngines: EngineEntry[]) {
    super(
      `Unknown engine id "${requestedEngine}". Available: ${availableEngines.map((e) => e.id).join(", ")}.`,
    )
    this.name = "UnknownEngineError"
    this.requestedEngine = requestedEngine
    this.availableEngines = availableEngines
  }
}

/**
 * Resolves an engine for the current tool call (precedence: explicit `override`
 * > sticky session selection > the only configured engine, else throws). Thin
 * adapter over the toolkit backend registry that re-exposes the camunda7
 * ergonomic shape and re-throws the toolkit's failures as the module's own
 * `EngineNotSelectedError` / `UnknownEngineError` so the error contract (codes,
 * `availableEngines`, the `camunda7_engine` remediation hint) is preserved.
 */
export function resolveEngine(
  override: string | undefined,
  registry: EngineRegistry,
): { client: Client; engineId: string; baseUrl: string; cockpitUrl?: string } {
  try {
    const backend = registry.backends.resolve(override)
    return {
      client: backend.client,
      engineId: backend.id,
      baseUrl: backend.meta?.baseUrl ?? "",
      cockpitUrl: backend.meta?.cockpitUrl,
    }
  } catch (e) {
    if (e instanceof BackendNotSelectedError) throw new EngineNotSelectedError(registry.engines)
    if (e instanceof UnknownBackendError)
      throw new UnknownEngineError(e.requestedId, registry.engines)
    throw e
  }
}

/**
 * AppConfig the camunda7 plugin hands to its pipeline steps (used by the
 * framework `render-view` / builder path). Mirrors the `appConfig` returned from
 * `createPlugin` — the steps must resolve a per-engine client from the registry
 * rather than receiving a single pre-bound client.
 */
export interface Camunda7StepAppConfig {
  registry: EngineRegistry
  engines: EngineEntry[]
}

/**
 * Resolve the engine for a pipeline step. Steps have no per-call `engine`
 * argument, so they honour an optional `camunda7:engine` view key, then fall
 * back to the sticky session selection or the only configured engine (same
 * precedence as {@link resolveEngine}).
 */
export function resolveStepEngine(
  appConfig: Camunda7StepAppConfig,
  override?: string,
): { client: Client; engineId: string; baseUrl: string; cockpitUrl?: string } {
  return resolveEngine(override, appConfig.registry)
}
