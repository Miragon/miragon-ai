import { useToolQuery } from "@miragon/mcp-toolkit-ui"
import type {
  AnalyticsDashboardData,
  EngineFilterInput,
  Period,
} from "@miragon-ai/analytics-client"
import { ANALYTICS_DASHBOARD_DATA } from "../../tool-names.js"

/** The cell props every split dashboard widget takes — the scope its self-fetch reads. */
export interface DashboardScopeProps {
  processDefinitionKey?: string
  period?: Period
  /** Configured engine id(s); omitted = every configured engine (the feed resolves it). */
  engine?: EngineFilterInput
}

// Centralised so all four split dashboard widgets share one self-fetch contract.
// The cache key includes every scope prop so per-cell instances (e.g. one tab
// per period or per engine) don't collide on a single shared cache entry — and
// an engine-scoped cell never reads a fleet-wide entry. Self-fetches the
// app-only *_data feed — calling the show_* tool from inside the iframe is
// host-defined behavior (hosts honoring resultCanProduceWidget may render a
// second widget per refresh).
export function useDashboardSelfFetch(
  initialData: AnalyticsDashboardData | null,
  props: DashboardScopeProps,
) {
  const { processDefinitionKey, period, engine } = props
  const queryArgs: DashboardScopeProps = {}
  if (processDefinitionKey) queryArgs.processDefinitionKey = processDefinitionKey
  if (period) queryArgs.period = period
  if (engine !== undefined) queryArgs.engine = engine
  return useToolQuery<AnalyticsDashboardData>(
    ["analytics:dashboard", processDefinitionKey ?? null, period ?? null, engine ?? null],
    ANALYTICS_DASHBOARD_DATA,
    queryArgs,
    { enabled: !initialData },
  )
}
