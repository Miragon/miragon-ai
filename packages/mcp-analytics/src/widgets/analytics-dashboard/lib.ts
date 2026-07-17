import { useViewToolQuery } from "@miragon-ai/widget-shell/widgets"
import type { AnalyticsDashboardData, Period } from "@miragon-ai/client-analytics"

export type AnalyticsDashboardPeriod = Period

export interface DashboardScopeProps {
  processDefinitionKey?: string
  period?: AnalyticsDashboardPeriod
}

// Centralised so all four split dashboard widgets share one self-fetch contract.
// The cache key includes the scope props so per-cell instances (e.g. one tab per
// period) don't collide on a single shared cache entry. Self-fetches a `show_*`
// tool, so it must parse structuredContent-first (`useViewToolQuery`) — the text
// channel only carries the model summary since the text-channel diet.
export function useDashboardSelfFetch(
  initialData: AnalyticsDashboardData | null,
  props: DashboardScopeProps,
) {
  const { processDefinitionKey, period } = props
  const queryArgs: DashboardScopeProps = {}
  if (processDefinitionKey) queryArgs.processDefinitionKey = processDefinitionKey
  if (period) queryArgs.period = period
  return useViewToolQuery<AnalyticsDashboardData>(
    ["analytics:dashboard", processDefinitionKey ?? null, period ?? null],
    "analytics_show_dashboard",
    queryArgs,
    { enabled: !initialData },
  )
}
