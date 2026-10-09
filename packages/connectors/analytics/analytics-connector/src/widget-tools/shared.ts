import type { MCPServer } from "mcp-use"
import type { CompareKpiDelta, PrometheusClient } from "@miragon-ai/analytics-client"
import type { ProfileSource, ServerT } from "../server-locale.js"
import type { AnalyticsEngineScope } from "../engine-ids.js"

/**
 * Everything the per-domain widget-tool registrars need, handed over by the
 * `widget-tools.ts` entry — mirrors camunda7's `WidgetToolsContext`. The
 * `_meta`/view bindings are NOT passed through: each registration spreads
 * `showToolBinding()` / `appOnly` from `@miragon-ai/widget-shell/server`
 * itself, so the dual-protocol contract stays in one place.
 */
export interface AnalyticsWidgetToolsContext {
  server: MCPServer
  ch: PrometheusClient
  /** The server's configured engine ids — every query resolves `engine` through it. */
  engineScope: AnalyticsEngineScope
  /** Locale for model-facing summaries plus the saved analytics defaults. */
  profileStore?: ProfileSource
}

/** Formats a nullable comparison delta ("+12.5%", "-3pp", "n/a") for summaries. */
function fmtDelta(value: number | null, unit: string): string {
  if (value == null) return "n/a"
  return `${value > 0 ? "+" : ""}${value}${unit}`
}

/**
 * Shared delta shape of the three compare queries, for one-line summaries. A
 * null delta reads "n/a" — a side was not measured (nothing ended, nothing
 * started) or the baseline is 0 — never a −100 %.
 */
export function compareDeltaSummary(delta: CompareKpiDelta): string {
  return [
    `starts/day ${fmtDelta(delta.started_per_day_delta_pct, "%")}`,
    `incident rate ${fmtDelta(delta.incident_rate_delta_pp, "pp")}`,
    ...(delta.element_incident_rate_delta_pp === null
      ? []
      : [`element incident rate ${fmtDelta(delta.element_incident_rate_delta_pp, "pp")}`]),
    `avg duration ${fmtDelta(delta.avg_duration_delta_pct, "%")}`,
    `p95 ${fmtDelta(delta.p95_duration_delta_pct, "%")}`,
  ].join(", ")
}

export const suppressedNote = (suppressed: boolean) =>
  suppressed ? " — flagged suppressed (sample below minBucketSize)" : ""

/**
 * The engine scope of a result, for summaries: one engine by name, or — the
 * deliberate fleet aggregate — every engine it adds up, so a fleet-wide figure
 * never reads as one engine's. `fleet` = the caller named no engine.
 */
export function engineScopeSummary(
  t: ServerT,
  engines: readonly string[] | null,
  fleet: boolean,
): string {
  if (!engines || engines.length === 0) return ""
  const ids = engines.map((id) => `"${id}"`).join(", ")
  if (fleet) return t("aSum.engineScopeFleet", { count: engines.length, ids })
  return engines.length === 1
    ? t("aSum.engineScopeOne", { id: engines[0] })
    : t("aSum.engineScopeSubset", { ids })
}
