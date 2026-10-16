import { useToolQuery } from "@miragon/mcp-toolkit-ui"
import type { EngineFilterInput, FailureDashboardData } from "@miragon/pulse-analytics-client"
import type { Named } from "../../bpmn-names.js"
import { ANALYTICS_FAILURE_DASHBOARD_DATA } from "../../tool-names.js"

/** The failure payload the widgets read: the figures plus the process names behind their keys. */
export type FailureView = Named<FailureDashboardData>

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
  initialData: FailureView | null,
  { engine }: FailureScopeProps,
) {
  return useToolQuery<FailureView>(
    ["analytics:failure-dashboard", engine ?? null],
    ANALYTICS_FAILURE_DASHBOARD_DATA,
    engine === undefined ? {} : { engine },
    { enabled: !initialData },
  )
}
