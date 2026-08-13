import { useToolQuery } from "@miragon/mcp-toolkit-ui"
import type { AnalyticsDashboardData, Period } from "@miragon-ai/analytics-client"
import { ANALYTICS_DASHBOARD_DATA } from "../../tool-names.js"

export type AnalyticsDashboardPeriod = Period

export interface DashboardScopeProps {
  processDefinitionKey?: string
  period?: AnalyticsDashboardPeriod
}

// Centralised so all four split dashboard widgets share one self-fetch contract.
// The cache key includes the scope props so per-cell instances (e.g. one tab per
// period) don't collide on a single shared cache entry. Self-fetches the
// app-only *_data feed — calling the show_* tool from inside the iframe is
// host-defined behavior (hosts honoring resultCanProduceWidget may render a
// second widget per refresh).
export function useDashboardSelfFetch(
  initialData: AnalyticsDashboardData | null,
  props: DashboardScopeProps,
) {
  const { processDefinitionKey, period } = props
  const queryArgs: DashboardScopeProps = {}
  if (processDefinitionKey) queryArgs.processDefinitionKey = processDefinitionKey
  if (period) queryArgs.period = period
  return useToolQuery<AnalyticsDashboardData>(
    ["analytics:dashboard", processDefinitionKey ?? null, period ?? null],
    ANALYTICS_DASHBOARD_DATA,
    queryArgs,
    { enabled: !initialData },
  )
}
