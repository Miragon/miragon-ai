import { useViewToolQuery } from "@miragon-ai/widget-shell/widgets"
import type { FailureDashboardData } from "@miragon-ai/client-analytics"

// Centralised so the three failure widgets share one self-fetch contract. The
// failure dashboard is point-in-time (live state gauges), so there is no period
// scope — every widget self-fetches the same current snapshot. Self-fetches a
// `show_*` tool, so it must parse structuredContent-first (`useViewToolQuery`) —
// the text channel only carries the model summary since the text-channel diet.
export function useFailureDashboardSelfFetch(initialData: FailureDashboardData | null) {
  return useViewToolQuery<FailureDashboardData>(
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
