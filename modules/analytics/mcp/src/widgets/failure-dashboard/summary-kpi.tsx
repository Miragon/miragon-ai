import { Card, CardContent, Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import type { FailureDashboardData } from "@miragon-ai/client-analytics"
import { useFailureDashboardSelfFetch, type Period } from "./lib.js"

export function FailureSummaryKpi({
  data: initialData,
  period,
}: {
  data: FailureDashboardData | null
  period?: Period
}) {
  const fallbackQuery = useFailureDashboardSelfFetch(initialData, { period })
  const data = initialData ?? fallbackQuery.data ?? null

  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        {fallbackQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{fallbackQuery.error.message}</AlertDescription>
          </Alert>
        ) : (
          <p className="text-muted-foreground text-sm">Loading failure analysis…</p>
        )}
      </div>
    )
  }
  return (
    <div className="bg-card text-card-foreground p-6">
      <div className="grid grid-cols-3 gap-4">
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm font-medium">Total Incidents</p>
            <p className="text-destructive text-2xl font-bold">{data.totalIncidents}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm font-medium">Unique Error Patterns</p>
            <p className="text-2xl font-bold">{data.uniqueErrorPatterns}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm font-medium">Most Affected</p>
            <p className="truncate font-mono text-lg font-bold">
              {data.mostAffectedProcess ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
