import { useToolQuery } from "@miragon/mcp-toolkit-ui"
import type { EngineFilterInput, FailureDashboardData } from "@miragon-ai/analytics-client"
import { ANALYTICS_FAILURE_DASHBOARD_DATA } from "../../tool-names.js"

/** The cell props every failure widget takes — the engine scope its self-fetch reads. */
export interface FailureScopeProps {
  /** Configured engine id(s); omitted = every configured engine (the feed resolves it). */
  engine?: EngineFilterInput
}

// Centralised so the three failure widgets share one self-fetch contract. The
// failure dashboard is point-in-time (live state gauges), so there is no period
// scope — only the engine scope, carried in the args AND the cache key so an
// engine-scoped cell never reads a fleet-wide entry. Self-fetches the app-only
// *_data feed — calling the show_* tool from inside the iframe is host-defined
// behavior (hosts honoring resultCanProduceWidget may render a second widget
// per refresh).
export function useFailureDashboardSelfFetch(
  initialData: FailureDashboardData | null,
  { engine }: FailureScopeProps,
) {
  return useToolQuery<FailureDashboardData>(
    ["analytics:failure-dashboard", engine ?? null],
    ANALYTICS_FAILURE_DASHBOARD_DATA,
    engine === undefined ? {} : { engine },
    { enabled: !initialData },
  )
}
