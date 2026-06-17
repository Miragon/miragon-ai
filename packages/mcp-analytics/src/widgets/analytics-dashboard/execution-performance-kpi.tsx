import { Alert, AlertDescription, Skeleton } from "@miragon/mcp-toolkit-ui"
import { KpiGrid, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { AnalyticsDashboardData } from "@miragon-ai/client-analytics"
import { formatDuration, useDashboardSelfFetch, type AnalyticsDashboardPeriod } from "./lib.js"
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
  const data = initialData ?? fallbackQuery.data ?? null

  if (!data) {
    return (
      <WidgetShell>
        {fallbackQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{fallbackQuery.error.message}</AlertDescription>
          </Alert>
        ) : (
          <div className="border-border grid grid-cols-2 gap-px overflow-hidden rounded-lg border sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card px-5 py-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-7 w-16" />
              </div>
            ))}
          </div>
        )}
      </WidgetShell>
    )
  }

  return (
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
  )
}
