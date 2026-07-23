import {
  KpiGrid,
  KpiGridSkeleton,
  WidgetShell,
  formatDuration,
} from "@miragon-ai/widget-shell/widgets"
import type { AnalyticsDashboardData } from "@miragon-ai/client-analytics"
import { useDashboardSelfFetch, type AnalyticsDashboardPeriod } from "./lib.js"
import { QueryGate } from "../query-gate.js"
import { useT } from "../../messages/use-t.js"

export function ExecutionPerformanceKpi({
  data: initialData,
  processDefinitionKey,
  period,
}: {
  data: AnalyticsDashboardData | null
  processDefinitionKey?: string
  period?: AnalyticsDashboardPeriod
}) {
  const t = useT()
  const fallbackQuery = useDashboardSelfFetch(initialData, { processDefinitionKey, period })

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
                label: t("aExecPerf.failureRate"),
                value: `${data.failureRatePct}%`,
                tone: data.failureRatePct > 0 ? "critical" : undefined,
              },
            ]}
          />
        </WidgetShell>
      )}
    </QueryGate>
  )
}
