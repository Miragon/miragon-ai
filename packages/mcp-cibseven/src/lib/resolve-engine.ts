import type { Client } from "@miragon-ai/client-cibseven"
import { getSelectedEngine } from "./engine-session.js"

export interface EngineEntry {
  id: string
  baseUrl: string
  cockpitUrl?: string
}

export interface EngineRegistry {
  engines: EngineEntry[]
  clients: Map<string, Client>
  cockpitUrls: Map<string, string | undefined>
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
 * Resolves an engine for the current tool call:
 *   1. explicit per-call `override` wins,
 *   2. otherwise the sticky session selection,
 *   3. otherwise, if only one engine is configured, that one,
 *   4. otherwise throws `EngineNotSelectedError` so the host can react.
 */
export function resolveEngine(
  override: string | undefined,
  registry: EngineRegistry,
): { client: Client; engineId: string; cockpitUrl?: string } {
  if (override) {
    const client = registry.clients.get(override)
    if (!client) {
      throw new UnknownEngineError(override, registry.engines)
    }
    return { client, engineId: override, cockpitUrl: registry.cockpitUrls.get(override) }
  }

  const sticky = getSelectedEngine()
  if (sticky) {
    const client = registry.clients.get(sticky)
    if (!client) {
      throw new UnknownEngineError(sticky, registry.engines)
    }
    return { client, engineId: sticky, cockpitUrl: registry.cockpitUrls.get(sticky) }
  }

  if (registry.engines.length === 1) {
    const only = registry.engines[0]
    return {
      client: registry.clients.get(only.id)!,
      engineId: only.id,
      cockpitUrl: registry.cockpitUrls.get(only.id),
    }
  }

  throw new EngineNotSelectedError(registry.engines)
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
 * precedence as {@link resolveEngine}). Also returns the engine's `baseUrl`
 * (for the data builders that render Cockpit deep-links).
 */
export function resolveStepEngine(
  appConfig: Camunda7StepAppConfig,
  override?: string,
): { client: Client; engineId: string; baseUrl: string; cockpitUrl?: string } {
  const { client, engineId, cockpitUrl } = resolveEngine(override, appConfig.registry)
  const baseUrl = appConfig.registry.engines.find((e) => e.id === engineId)?.baseUrl ?? ""
  return { client, engineId, baseUrl, cockpitUrl }
}
