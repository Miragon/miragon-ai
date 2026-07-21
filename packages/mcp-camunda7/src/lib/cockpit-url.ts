import type { CockpitRef, EngineProvider } from "../engine-provider.js"

/**
 * URL builders for jump-out links into the engine's Cockpit web UI. The
 * flavor-specific parts (webapp base derivation, hash routes) come from the
 * resolved engine's provider ([[EngineProvider.cockpit]]) — this file only
 * owns the flavor-independent invariants: an explicit `cockpitUrl` is the
 * webapp BASE (the provider still decides the route), only `http(s):` bases
 * are accepted, and an unbuildable link is `null`, never a guessed URL.
 */

/** The resolved-engine slice the link builders need (subset of `EngineContext`). */
export interface EngineLink {
  baseUrl: string
  cockpitUrl?: string
  provider: EngineProvider
}

export interface CockpitUrlOptions {
  /** Cockpit tab to open by default (e.g. `"incidents"`, `"variables"`); flavors without tab deep-links ignore it. */
  tab?: string
}

/** `?tab=…` suffix helper shared by the provider route strategies. */
export function tabSuffix(tab: string | undefined): string {
  return tab ? `?tab=${encodeURIComponent(tab)}` : ""
}

function resolveCockpitBase(engine: EngineLink): string | null {
  const base = engine.cockpitUrl?.trim() || engine.provider.cockpit.deriveWebappBase(engine.baseUrl)
  if (!base || !/^https?:/i.test(base)) return null
  return base.replace(/[/#]+$/, "")
}

/**
 * Build a Cockpit URL pointing at a single process definition page.
 * Returns `null` if no webapp base can be resolved or the flavor's route
 * cannot be built from the given [[CockpitRef]].
 */
export function buildProcessCockpitUrl(
  engine: EngineLink,
  ref: CockpitRef,
  options?: CockpitUrlOptions,
): string | null {
  const base = resolveCockpitBase(engine)
  if (!base) return null
  const route = engine.provider.cockpit.processRoute(ref, options?.tab)
  return route ? base + route : null
}

/** Build a Cockpit URL pointing at a single process *instance* page. */
export function buildInstanceCockpitUrl(
  engine: EngineLink,
  ref: CockpitRef,
  options?: CockpitUrlOptions,
): string | null {
  const base = resolveCockpitBase(engine)
  if (!base) return null
  const route = engine.provider.cockpit.instanceRoute(ref, options?.tab)
  return route ? base + route : null
}
