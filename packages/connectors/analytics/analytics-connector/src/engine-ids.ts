import type { EngineFilterInput } from "@miragon-ai/analytics-client"

/**
 * Which engines analytics may read on this server. A Prometheus (or Thanos /
 * Mimir) is often shared across teams, and every analytics query reads every
 * `engine_id` it holds unless told otherwise — so analytics covers exactly the
 * server's CONFIGURED engine ids, never "whatever Prometheus has":
 *
 * - the composition root injects them (`SharedResources.engineIds`, from the
 *   camunda7 module's engine list) — analytics has no engine-SDK dependency;
 * - a standalone analytics boot names them in `ANALYTICS_ENGINE_IDS`;
 * - with neither, analytics is FAIL-CLOSED: every engine-reading tool refuses
 *   with {@link NO_ENGINE_SCOPE_MESSAGE} (and the boot warns) instead of
 *   reading the whole Prometheus.
 *
 * An omitted `engine` argument resolves to all configured ids (the fleet
 * view, labelled as such in results); an id outside them is refused.
 */
export interface AnalyticsEngineScope {
  /** The configured ids, in configuration order; empty when none are configured. */
  readonly ids: readonly string[]
  /** The concrete ids a query reads for a caller's `engine` filter. Throws on an unknown id. */
  resolve(requested: EngineFilterInput): string[]
  /** One configured id (`field` names the argument in the refusal). */
  require(id: string, field: string): string
  /** True when `resolved` (a {@link resolve} result) covers every configured engine. */
  coversFleet(resolved: readonly string[]): boolean
}

/**
 * `args` with `engine` replaced by the concrete configured ids it resolves to
 * — what every engine-reading tool hands its query, so no query ever runs
 * unscoped against a shared Prometheus.
 */
export function withEngineScope<T extends { engine?: EngineFilterInput }>(
  scope: AnalyticsEngineScope,
  args: T,
): Omit<T, "engine"> & { engine: string[] } {
  return { ...args, engine: scope.resolve(args.engine) }
}

export const NO_ENGINE_SCOPE_MESSAGE =
  "Analytics covers no engine: this server configures no engine ids. Activate the camunda7 module (its configured engines scope analytics) or set ANALYTICS_ENGINE_IDS to the engine_id values analytics may read."

/** True when the caller named no engine — the request covers the whole configured fleet. */
export function isFleetRequest(requested: EngineFilterInput): boolean {
  if (requested === undefined || requested === null) return true
  return (Array.isArray(requested) ? requested : [requested]).every((id) => id.length === 0)
}

export function createEngineScope(configured: readonly string[] | undefined): AnalyticsEngineScope {
  const ids = [...new Set((configured ?? []).map((id) => id.trim()).filter((id) => id.length > 0))]

  function assertConfigured(): void {
    if (ids.length === 0) throw new Error(NO_ENGINE_SCOPE_MESSAGE)
  }

  function refuseUnknown(unknown: string[], field: string): never {
    const list = unknown.map((id) => `"${id}"`).join(", ")
    throw new Error(
      `Unknown engine ${list} in ${field} — analytics covers only this server's configured engines: ${ids.join(", ")}.`,
    )
  }

  return {
    ids,
    resolve(requested) {
      assertConfigured()
      if (isFleetRequest(requested)) return [...ids]
      const list = typeof requested === "string" ? [requested] : (requested ?? [])
      const named = [...new Set(list.filter((id) => id.length > 0))]
      const unknown = named.filter((id) => !ids.includes(id))
      if (unknown.length > 0) refuseUnknown(unknown, "engine")
      return named
    },
    require(id, field) {
      assertConfigured()
      if (!ids.includes(id)) refuseUnknown([id], field)
      return id
    },
    coversFleet(resolved) {
      return ids.length > 0 && ids.every((id) => resolved.includes(id))
    },
  }
}
