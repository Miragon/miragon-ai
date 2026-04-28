import { useToolQuery } from "@miragon/mcp-toolkit-ui"
import type { FailureDashboardData } from "@miragon-ai/client-analytics"

export const PERIODS = ["1d", "7d", "30d", "90d"] as const
export type Period = (typeof PERIODS)[number]

export interface FailureScopeProps {
  period?: Period
}

// Centralised so the three failure widgets share one self-fetch contract. The
// cache key includes the scope so per-cell instances (e.g. one tab per period)
// don't collide on a single shared cache entry.
export function useFailureDashboardSelfFetch(
  initialData: FailureDashboardData | null,
  props: FailureScopeProps,
) {
  const { period } = props
  const queryArgs: FailureScopeProps = {}
  if (period) queryArgs.period = period
  return useToolQuery<FailureDashboardData>(
    ["analytics:failure-dashboard", period ?? null],
    "analytics_show_failure_dashboard",
    queryArgs,
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
