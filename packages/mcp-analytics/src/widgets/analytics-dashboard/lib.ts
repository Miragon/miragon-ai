import { useToolQuery } from "@miragon/mcp-toolkit-ui"
import type { AnalyticsDashboardData } from "@miragon-ai/client-analytics"

export function formatDuration(ms: number | null): string {
  if (ms == null) return "-"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}min`
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`
  return `${(ms / 86400000).toFixed(1)}d`
}

export type AnalyticsDashboardPeriod = "1d" | "3d" | "7d" | "14d" | "30d"

export interface DashboardScopeProps {
  processDefinitionKey?: string
  period?: AnalyticsDashboardPeriod
}

// Centralised so all four split dashboard widgets share one self-fetch contract.
// The cache key includes the scope props so per-cell instances (e.g. one tab per
// period) don't collide on a single shared cache entry.
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
    "analytics_show_dashboard",
    queryArgs,
    { enabled: !initialData },
  )
}
