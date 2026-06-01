import { useToolQuery } from "@miragon/mcp-toolkit-ui"
import type { FailureDashboardData } from "@miragon-ai/client-analytics"

// Centralised so the three failure widgets share one self-fetch contract. The
// failure dashboard is point-in-time (live state gauges), so there is no period
// scope — every widget self-fetches the same current snapshot.
export function useFailureDashboardSelfFetch(initialData: FailureDashboardData | null) {
  return useToolQuery<FailureDashboardData>(
    ["analytics:failure-dashboard"],
    "analytics_show_failure_dashboard",
    {},
    { enabled: !initialData },
  )
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function truncate(s: string, max: number): string {
  if (!s) return "—"
  return s.length > max ? s.slice(0, max) + "…" : s
}
