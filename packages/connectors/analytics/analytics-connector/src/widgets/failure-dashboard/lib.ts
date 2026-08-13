import { useToolQuery } from "@miragon/mcp-toolkit-ui"
import type { FailureDashboardData } from "@miragon-ai/analytics-client"
import { ANALYTICS_FAILURE_DASHBOARD_DATA } from "../../tool-names.js"

// Centralised so the three failure widgets share one self-fetch contract. The
// failure dashboard is point-in-time (live state gauges), so there is no period
// scope — every widget self-fetches the same current snapshot. Self-fetches
// the app-only *_data feed — calling the show_* tool from inside the iframe is
// host-defined behavior (hosts honoring resultCanProduceWidget may render a
// second widget per refresh).
export function useFailureDashboardSelfFetch(initialData: FailureDashboardData | null) {
  return useToolQuery<FailureDashboardData>(
    ["analytics:failure-dashboard"],
    ANALYTICS_FAILURE_DASHBOARD_DATA,
    {},
    { enabled: !initialData },
  )
}
