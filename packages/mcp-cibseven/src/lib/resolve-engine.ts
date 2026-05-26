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
 * The payload mirrors what `mcp-use` returns in a tool's `content` block when
 * a handler throws — the host LLM can read the structured fields, pick an
 * engine, and call `camunda7_select_engine` before retrying.
 */
export class EngineNotSelectedError extends Error {
  readonly code = "ENGINE_NOT_SELECTED" as const
  readonly availableEngines: EngineEntry[]
  constructor(availableEngines: EngineEntry[]) {
    super(
      "No engine selected for this session. Call camunda7_select_engine with one of the available engine ids before invoking operations tools.",
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
