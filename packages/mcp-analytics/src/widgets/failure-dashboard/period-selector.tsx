import { Button } from "@miragon/mcp-toolkit-ui"
import { useHostActions } from "@miragon-ai/widget-shell/widgets"
import type { FailureDashboardData } from "@miragon-ai/client-analytics"
import { PERIODS } from "./lib.js"

/**
 * Period chooser for the failure dashboard. On selection, asks the host to
 * re-invoke `analytics_show_failure_dashboard` with the new window — this
 * re-renders the entire composed view (KPI + tables) with fresh data, since
 * widget slots cannot share React state across the layout.
 */
export function PeriodSelector({ data }: { data: FailureDashboardData | null }) {
  const host = useHostActions()
  const active = data?.period ?? "7d"

  function pick(period: string) {
    if (period === active) return
    host.showWidget(
      `Show me the failure dashboard for the last ${period} (use analytics_show_failure_dashboard with period: "${period}")`,
    )
  }

  return (
    <div className="bg-card text-card-foreground flex items-center justify-between p-6 pb-0">
      <h2 className="text-xl font-semibold">Failure Analysis</h2>
      <div className="flex items-center gap-1">
        {PERIODS.map((p) => (
          <Button
            key={p}
            variant={active === p ? "default" : "outline"}
            size="sm"
            onClick={() => pick(p)}
          >
            {p}
          </Button>
        ))}
      </div>
    </div>
  )
}
