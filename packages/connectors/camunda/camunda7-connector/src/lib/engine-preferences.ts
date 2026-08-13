import type { ProfileSource } from "@miragon-ai/widget-shell/server"
import { resolveProfileKey } from "./resolve-profile-key.js"
import { parseCamunda7Settings, type Camunda7Settings } from "./profile-schema.js"
import type { EngineEntry } from "./resolve-engine.js"

/**
 * The profile-driven engine preferences, single-sourced so the tool surface
 * (`camunda7_engine`), the per-call default-engine fallback ([[resolveEngine]]
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
 * The caller's saved default engine (`profile.modules.camunda7.defaultEngineId`),
 * or undefined when none is saved, no caller identity resolves, or the saved id
 * is not among the engines the profile may pick from (stale ids fail soft —
 * a removed engine must not poison every subsequent call). Reads the profile
 * off the ambient request identity (argument-less `resolveProfileKey`), so it
 * works from registrar handlers and the registry's per-call lookup alike.
 */
export async function profileDefaultEngineId(
  store: ProfileSource,
  engines: EngineEntry[],
): Promise<string | undefined> {
  const key = resolveProfileKey()
  const record = key ? await store.get(key) : undefined
  const settings = parseCamunda7Settings(record)
  const id = settings.defaultEngineId
  return id && allowedEngines(settings, engines).some((e) => e.id === id) ? id : undefined
}
