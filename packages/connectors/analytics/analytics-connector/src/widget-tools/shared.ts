import type { MCPServer } from "mcp-use"
import type { PrometheusClient } from "@miragon-ai/analytics-client"
import type { ProfileSource } from "../server-locale.js"

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
  /** Locale for model-facing summaries plus the saved analytics defaults. */
  profileStore?: ProfileSource
}

/** Formats a nullable comparison delta ("+12.5%", "-3pp", "n/a") for summaries. */
function fmtDelta(value: number | null, unit: string): string {
  if (value == null) return "n/a"
  return `${value > 0 ? "+" : ""}${value}${unit}`
}

/** Shared delta shape of the three compare queries, for one-line summaries. */
export function compareDeltaSummary(delta: {
  failure_rate_delta_pp: number | null
  avg_duration_delta_pct: number | null
  p95_duration_delta_pct: number | null
}): string {
  return (
    `failure rate ${fmtDelta(delta.failure_rate_delta_pp, "pp")}, ` +
    `avg duration ${fmtDelta(delta.avg_duration_delta_pct, "%")}, ` +
    `p95 ${fmtDelta(delta.p95_duration_delta_pct, "%")}`
  )
}

export const suppressedNote = (suppressed: boolean) =>
  suppressed ? " — flagged suppressed (sample below minBucketSize)" : ""
