import { Card, CardContent, Alert, AlertDescription, useToolQuery } from "@miragon/mcp-toolkit-ui"
import type { AnalyticsDashboardData } from "@miragon-ai/client-analytics"
import { formatDuration } from "./lib.js"

export function ExecutionPerformanceKpi({
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
        ) : null}
      </div>
    )
  }

  return (
    <div className="bg-card text-card-foreground p-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="bg-primary/10 border-primary/30 text-primary gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80">Avg Duration</p>
            <p className="text-2xl font-bold">{formatDuration(data.avgDurationMs)}</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/10 border-primary/30 text-primary gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80">Median</p>
            <p className="text-2xl font-bold">{formatDuration(data.medianDurationMs)}</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/10 border-primary/30 text-primary gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80">P95</p>
            <p className="text-2xl font-bold">{formatDuration(data.p95DurationMs)}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm font-medium opacity-80">Failure Rate</p>
            <p className="text-2xl font-bold">{data.failureRatePct}%</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
