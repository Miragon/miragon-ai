import { Card, CardContent, Alert, AlertDescription, Skeleton } from "@miragon/mcp-toolkit-ui"
import { WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { FailureDashboardData } from "@miragon-ai/client-analytics"
import { useFailureDashboardSelfFetch } from "./lib.js"

export function FailureSummaryKpi({ data: initialData }: { data: FailureDashboardData | null }) {
  const fallbackQuery = useFailureDashboardSelfFetch(initialData)
  const data = initialData ?? fallbackQuery.data ?? null

  if (!data) {
    return (
      <WidgetShell>
        {fallbackQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{fallbackQuery.error.message}</AlertDescription>
          </Alert>
        ) : (
          <div
            className="grid grid-cols-3 gap-4"
            aria-label="Loading failure analysis summary"
            aria-busy="true"
          >
            {[0, 1, 2].map((i) => (
              <Card key={i} className="gap-0 py-0 shadow-none">
                <CardContent className="space-y-2 p-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-7 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </WidgetShell>
    )
  }
  return (
    <WidgetShell>
      <div className="grid grid-cols-3 gap-4" aria-label="Failure analysis summary">
        <Card className="bg-critical-soft gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-critical text-sm font-medium">Total Incidents</p>
            <p className="text-critical text-2xl font-bold">{data.totalIncidents}</p>
          </CardContent>
        </Card>
        <Card className="bg-warning-soft gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-warning text-sm font-medium">Unique Error Patterns</p>
            <p className="text-warning text-2xl font-bold">{data.uniqueErrorPatterns}</p>
          </CardContent>
        </Card>
        <Card className="bg-m-blue-soft gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-m-blue text-sm font-medium">Most Affected</p>
            <p className="text-m-blue truncate font-mono text-lg font-bold">
              {data.mostAffectedProcess ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>
    </WidgetShell>
  )
}
