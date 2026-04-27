import { Card, CardContent, Alert, AlertDescription, useToolQuery } from "@miragon/mcp-toolkit-ui"
import type { AnalyticsDashboardData } from "@miragon-ai/client-analytics"

export function ExecutionSummaryKpi({
  data: initialData,
}: {
  data: AnalyticsDashboardData | null
}) {
  const fallbackQuery = useToolQuery<AnalyticsDashboardData>(
    ["analytics:dashboard"],
    "analytics_show_dashboard",
    {},
    { enabled: !initialData },
  )
  const data = initialData ?? fallbackQuery.data ?? null

  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        {fallbackQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{fallbackQuery.error.message}</AlertDescription>
          </Alert>
        ) : (
          <p className="text-muted-foreground text-sm">Loading process analytics…</p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-4 p-6">
      <h2 className="text-xl font-semibold">Process Analytics</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm font-medium opacity-80">Total</p>
            <p className="text-2xl font-bold">{data.totalCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-success/10 border-success/30 text-success-foreground gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80">Completed</p>
            <p className="text-2xl font-bold">{data.completedCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-info/10 border-info/30 text-info-foreground gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80">Running</p>
            <p className="text-2xl font-bold">{data.runningCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-destructive/10 border-destructive/30 text-destructive gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80">Failed</p>
            <p className="text-2xl font-bold">{data.failedCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-destructive/10 border-destructive/30 text-destructive gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80">Incidents</p>
            <p className="text-2xl font-bold">{data.incidentCount}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
