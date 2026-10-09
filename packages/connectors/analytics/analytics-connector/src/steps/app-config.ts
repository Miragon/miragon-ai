import type { EngineFilterInput, PrometheusClient } from "@miragon-ai/analytics-client"
import type { AnalyticsEngineScope } from "../engine-ids.js"

/** What the analytics plugin hands its pipeline steps (`appConfig` in `plugin.ts`). */
export interface AnalyticsAppConfig {
  client: PrometheusClient
  /** The server's configured engine ids — a step never reads an engine outside them. */
  engineScope: AnalyticsEngineScope
}

/** The optional `analytics:engine` scoping key both steps read. */
export const ENGINE_KEY_DECLARATION = {
  key: "analytics:engine",
  description:
    "Engine id, or a list of ids, to scope to (one of the server's configured engines). When omitted, every configured engine is aggregated — the result's `engines` names them.",
}

/** The step's `analytics:engine` key resolved to configured ids (omitted = all of them). */
export function stepEngines(
  keys: Record<string, unknown>,
  engineScope: AnalyticsEngineScope,
): string[] {
  const raw = keys["analytics:engine"]
  const requested: EngineFilterInput =
    typeof raw === "string" || (Array.isArray(raw) && raw.every((id) => typeof id === "string"))
      ? raw
      : undefined
  return engineScope.resolve(requested)
}
