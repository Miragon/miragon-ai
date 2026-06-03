import { Alert, AlertDescription, Skeleton } from "@miragon/mcp-toolkit-ui"
import { KpiGrid, WidgetHeader, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { AnalyticsDashboardData } from "@miragon-ai/client-analytics"
import { useDashboardSelfFetch, type AnalyticsDashboardPeriod } from "./lib.js"

export function ExecutionSummaryKpi({
  data: initialData,
  processDefinitionKey,
  period,
}: {
  data: AnalyticsDashboardData | null
  processDefinitionKey?: string
  period?: AnalyticsDashboardPeriod
}) {
  const fallbackQuery = useDashboardSelfFetch(initialData, { processDefinitionKey, period })
  const data = initialData ?? fallbackQuery.data ?? null

  if (!data) {
    return (
      <WidgetShell>
        <WidgetHeader icon="▤" iconTone="info" title="Process Analytics" />
        {fallbackQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{fallbackQuery.error.message}</AlertDescription>
          </Alert>
        ) : (
          <div className="border-border grid grid-cols-2 gap-px overflow-hidden rounded-lg border sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-card px-5 py-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2 h-7 w-12" />
              </div>
            ))}
          </div>
        )}
      </WidgetShell>
    )
  }

  return (
    <WidgetShell>
      <WidgetHeader icon="▤" iconTone="info" title="Process Analytics" />
      <KpiGrid
        boxed
        header={{ label: "Execution Summary" }}
        cells={[
          { label: "Total", value: data.totalCount },
          {
            label: "Completed",
            value: data.completedCount,
            tone: data.completedCount > 0 ? "success" : undefined,
          },
          {
            label: "Running",
            value: data.runningCount,
            tone: data.runningCount > 0 ? "info" : undefined,
          },
          {
            label: "Failed",
            value: data.failedCount,
            tone: data.failedCount > 0 ? "critical" : undefined,
          },
          {
            label: "Incidents",
            value: data.incidentCount,
            tone: data.incidentCount > 0 ? "critical" : undefined,
          },
        ]}
      />
    </WidgetShell>
  )
}
