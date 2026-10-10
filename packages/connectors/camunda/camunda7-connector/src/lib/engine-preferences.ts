import { readProfileAdvisory, type ProfileSource } from "@miragon-ai/widget-shell/server"
import { resolveProfileKey } from "./resolve-profile-key.js"
import { parseCamunda7Settings, type Camunda7Settings } from "./profile-schema.js"
import {
  EngineNotSelectedError,
  resolveEngine,
  type EngineCallContext,
  type EngineEntry,
  type EngineRegistry,
} from "./resolve-engine.js"

/**
 * The profile-driven engine preferences, single-sourced so the tool surface
 * (`camunda7_list_engines`/`camunda7_select_engine`), the per-call default-engine fallback ([[resolveEngine]]
 * via the registry's injected lookup) and any view all apply the SAME rules —
 * a drift here would let a user save a default they then cannot resolve.
 */

/**
 * The engines a profile may pick from. An empty/absent `allowedEngineIds`
 * means "all" — never lock a caller out of every engine — and a stale
 * allow-list that no longer matches any configured engine falls back to all
 * rather than rendering an empty picker. Curation, not security: an explicit
 * per-call `engine` override still reaches any configured engine.
 */
export function allowedEngines(settings: Camunda7Settings, engines: EngineEntry[]): EngineEntry[] {
  const allowed = settings.allowedEngineIds
  if (!allowed || allowed.length === 0) return engines
  const filtered = engines.filter((e) => allowed.includes(e.id))
  return filtered.length > 0 ? filtered : engines
}

/**
 * The caller's camunda7 settings for ADVISORY use — routing and the engine
 * picker only prefer them. Never throws: no caller identity, or a profile
 * store that is down (a preferences-database outage), reads as the defaults —
 * logged once, sanitized, by `readProfileAdvisory` — so no engine call ever
 * fails on (or leaks the host:port of) the preferences database. Pass the
 * handler `ctx` wherever one exists; without it (pipeline steps) the caller
 * resolves from the ambient request info — the same `resolveProfileKey`
 * either way, so the tool surface and the routing read the same profile.
 */
export async function advisoryCamunda7Settings(
  store: ProfileSource,
  ctx?: unknown,
): Promise<Camunda7Settings> {
  return parseCamunda7Settings(await readProfileAdvisory(store, resolveProfileKey(ctx)))
}

/**
 * The caller's saved default engine (`profile.modules.camunda7.defaultEngineId`),
 * or undefined when none is saved, no caller identity resolves, the store is
 * unreachable, or the saved id is not among the engines the profile may pick
 * from (stale ids fail soft — a removed engine must not poison every
 * subsequent call).
 */
export async function profileDefaultEngineId(
  store: ProfileSource,
  engines: EngineEntry[],
  ctx?: unknown,
): Promise<string | undefined> {
  const settings = await advisoryCamunda7Settings(store, ctx)
  const id = settings.defaultEngineId
  return id && allowedEngines(settings, engines).some((e) => e.id === id) ? id : undefined
}

/**
 * An engine the caller named that their own engine list (`allowedEngineIds`)
 * leaves out — refused where a VIEW scopes to that list: the cockpit's picker
 * and switcher cannot show it, so opening on it would strand the user.
 */
export class EngineNotAvailableError extends Error {
  readonly code = "ENGINE_NOT_AVAILABLE" as const
  constructor(requestedEngine: string, available: EngineEntry[]) {
    super(
      `Engine "${requestedEngine}" is not in this user's engine list (allowedEngineIds) — ` +
        `the cockpit offers: ${available.map((e) => e.id).join(", ")}. ` +
        "Open it on one of those, or pass `engine` to the camunda7 tools directly.",
    )
    this.name = "EngineNotAvailableError"
  }
}

/** Where the cockpit opens: the caller's engine list and the engine it lands on (null = the picker). */
export interface CockpitEngineScope {
  engines: EngineEntry[]
  engineId: string | null
}

/**
 * The cockpit's engine scope at open — the SAME precedence as every engine
 * call ({@link resolveEngine}: per-call `override` > the caller's saved
 * default > the only engine), over the SAME list `camunda7_list_engines`
 * returns ({@link allowedEngines}), so the bootstrap never names an engine
 * the in-app picker then cannot show:
 *
 * - an `override` must be configured (UNKNOWN_ENGINE otherwise) AND in the
 *   caller's list ({@link EngineNotAvailableError});
 * - without one, only "no engine selected" falls back — to the only engine
 *   left in the caller's list, else the picker (`engineId: null`). Any other
 *   failure propagates: a tool error, never a silent picker.
 */
export async function cockpitEngineScope(
  store: ProfileSource,
  registry: EngineRegistry,
  override: string | undefined,
  call?: EngineCallContext,
): Promise<CockpitEngineScope> {
  const engines = allowedEngines(await advisoryCamunda7Settings(store, call), registry.engines)
  let engineId: string
  try {
    engineId = (await resolveEngine(override, registry, call)).engineId
  } catch (e) {
    // Only reachable without an override: several engines, no saved default.
    if (!(e instanceof EngineNotSelectedError)) throw e
    return { engines, engineId: engines.length === 1 ? engines[0].id : null }
  }
  if (!engines.some((e) => e.id === engineId)) throw new EngineNotAvailableError(engineId, engines)
  return { engines, engineId }
}
