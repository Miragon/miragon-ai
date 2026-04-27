import { Card, CardContent, Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import type { FailureDashboardData } from "@miragon-ai/client-analytics"

export function FailureSummaryKpi({ data }: { data: FailureDashboardData | null }) {
  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert variant="destructive">
          <AlertDescription>No failure data available</AlertDescription>
        </Alert>
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
