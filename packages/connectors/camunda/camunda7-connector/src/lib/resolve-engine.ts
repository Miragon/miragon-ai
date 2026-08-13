import {
  BackendNotSelectedError,
  UnknownBackendError,
  createBackendRegistry,
  type BackendRegistry,
} from "@miragon/mcp-toolkit-core/tools"
import type { Client } from "@miragon-ai/camunda7-client"
import type { EngineProvider } from "../engine-provider.js"
import { providerForEntry } from "../providers/index.js"

// Engine-config vocabulary lives next to the provider port; re-exported here
// so existing importers keep their stable path.
export type { EngineAuth, EngineEntry, EngineFlavor } from "../engine-provider.js"
import type { EngineEntry } from "../engine-provider.js"

/** Per-engine metadata carried on each backend-registry entry. */
export interface EngineMeta {
  baseUrl: string
  cockpitUrl?: string
  /** The vendor provider resolved from the entry's `flavor` at boot. */
  provider: EngineProvider
}

/**
 * Engine routing for the camunda7 module. Wraps the toolkit's generic
 * {@link BackendRegistry} (id validation, single-default fallback) alongside
 * the static configured engine list and the injected default-engine lookup.
 *
 * There is deliberately NO per-session selection state: mcp-use 2 serves HTTP
 * statelessly (no MCP session ids), and in-memory selection state would break
 * behind any load balancer with more than one replica. The durable equivalent
 * is the profile's `modules.camunda7.defaultEngineId`, surfaced here as
 * {@link EngineRegistry.defaultEngineId} and consulted per call by
 * [[resolveEngine]] when no explicit override is given.
 */
export interface EngineRegistry {
  backends: BackendRegistry<Client, EngineMeta>
  engines: EngineEntry[]
  /**
   * The caller's saved default engine (undefined when none is saved or no
   * caller identity resolves). Injected by the plugin so this module's lib
   * stays free of profile plumbing; async because it reads the profile store.
   */
  defaultEngineId?: () => Promise<string | undefined>
}

/**
 * Builds an {@link EngineRegistry} from the configured engines and a factory
 * that creates the REST client for each. `opts.defaultEngineId` is the saved
 * per-user default lookup (see [[profileDefaultEngineId]]); tests inject a
 * stub, production wires the profile-store read.
 */
export function createEngineRegistry(
  engines: EngineEntry[],
  clientFor: (engine: EngineEntry) => Client,
  opts?: { defaultEngineId?: () => Promise<string | undefined> },
): EngineRegistry {
  const backends = createBackendRegistry<Client, EngineMeta>(
    engines.map((e) => ({
      id: e.id,
      client: clientFor(e),
      // providerForEntry throws on an unknown flavor — a misconfigured engine
      // fails the boot instead of producing silently wrong cockpit links.
      meta: { baseUrl: e.baseUrl, cockpitUrl: e.cockpitUrl, provider: providerForEntry(e) },
    })),
    { label: "engine" },
  )
  return { backends, engines, defaultEngineId: opts?.defaultEngineId }
}

/**
 * Thrown when an operations tool is invoked without a per-call `engine`, no
 * default engine is saved for the caller, and the registry holds more than
 * one engine.
 *
 * The message lists the available engine ids because the error path only
 * serialises code + message (the structured `availableEngines` field never
 * reaches the model) — naming them here saves the LLM a
 * `camunda7_engine` (action "list") roundtrip before it can pick one.
 */
export class EngineNotSelectedError extends Error {
  readonly code = "ENGINE_NOT_SELECTED" as const
  readonly availableEngines: EngineEntry[]
  constructor(availableEngines: EngineEntry[]) {
    super(
      `No engine specified and no default engine saved. Available engines: ${availableEngines
        .map((e) => e.id)
        .join(
          ", ",
        )}. Pass the per-call \`engine\` parameter, or save a default with camunda7_engine action "select".`,
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
 * The caller's saved default, validated against the CONFIGURED engines: a
 * stored id that no longer matches any engine degrades to "no default"
 * (single-default fallback or {@link EngineNotSelectedError}) instead of
 * failing every call on a stale preference.
 */
async function savedDefault(registry: EngineRegistry): Promise<string | undefined> {
  const id = await registry.defaultEngineId?.()
  return id && registry.engines.some((e) => e.id === id) ? id : undefined
}

/**
 * Resolves an engine for the current tool call (precedence: explicit `override`
 * > the caller's saved default engine > the only configured engine, else
 * throws). Thin adapter over the toolkit backend registry that re-exposes the
 * camunda7 ergonomic shape and re-throws the toolkit's failures as the
 * module's own `EngineNotSelectedError` / `UnknownEngineError` so the error
 * contract (codes, `availableEngines`, the remediation hint) is preserved.
 */
export async function resolveEngine(
  override: string | undefined,
  registry: EngineRegistry,
): Promise<{
  client: Client
  engineId: string
  baseUrl: string
  cockpitUrl?: string
  provider: EngineProvider
}> {
  try {
    const backend = registry.backends.resolve(override ?? (await savedDefault(registry)))
    return {
      client: backend.client,
      engineId: backend.id,
      baseUrl: backend.meta?.baseUrl ?? "",
      cockpitUrl: backend.meta?.cockpitUrl,
      // Meta is always set by createEngineRegistry; the fallback only guards
      // registries built outside it (tests) and resolves to the default flavor.
      provider: backend.meta?.provider ?? providerForEntry({ id: backend.id }),
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
 * back to the caller's saved default engine or the only configured engine
 * (same precedence as {@link resolveEngine}).
 */
export function resolveStepEngine(
  appConfig: Camunda7StepAppConfig,
  override?: string,
): Promise<{
  client: Client
  engineId: string
  baseUrl: string
  cockpitUrl?: string
  provider: EngineProvider
}> {
  return resolveEngine(override, appConfig.registry)
}
