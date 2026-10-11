import {
  KpiGrid,
  KpiGridSkeleton,
  WidgetShell,
  formatDuration,
  formatNumber,
} from "@miragon-ai/widget-shell/widgets"
import type { AnalyticsDashboardData } from "@miragon-ai/analytics-client"
import { useDashboardSelfFetch, type DashboardScopeProps } from "./lib.js"
import { QueryGate } from "../query-gate.js"
import { useT } from "../../messages/use-t.js"

export function ExecutionPerformanceKpi({
  data: initialData,
  processDefinitionKey,
  period,
  engine,
}: { data: AnalyticsDashboardData | null } & DashboardScopeProps) {
  const t = useT()
  const fallbackQuery = useDashboardSelfFetch(initialData, { processDefinitionKey, period, engine })

  return (
    <QueryGate
      initialData={initialData}
      query={fallbackQuery}
      skeleton={<KpiGridSkeleton cells={4} boxed />}
    >
      {(data) => (
        <WidgetShell>
          <KpiGrid
            boxed
            header={{ label: t("aExecPerf.headerLabel") }}
            cells={[
              { label: t("aExecPerf.avgDuration"), value: formatDuration(data.avgDurationMs) },
              { label: t("aExecPerf.median"), value: formatDuration(data.medianDurationMs) },
              { label: t("aExecPerf.p95"), value: formatDuration(data.p95DurationMs) },
              {
                label: t("aExecPerf.incidentRate"),
                // Incidents per 100 starts: one instance may carry several, so
                // the rate can pass 100 and reads as a number, not a share.
                value: formatNumber(data.incidentRatePct, { maximumFractionDigits: 1 }),
                tone: (data.incidentRatePct ?? 0) > 0 ? "danger" : undefined,
              },
            ]}
          />
        </WidgetShell>
      )}
    </QueryGate>
  )
}
