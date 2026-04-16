import {
  Card,
  CardContent,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Alert,
  AlertDescription,
} from "@miragon/mcp-toolkit-ui"
import type { AnalyticsDashboardData } from "@automation-mcp/client-analytics"

export type { AnalyticsDashboardData }

function formatDuration(ms: number | null): string {
  if (ms == null) return "-"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}min`
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`
  return `${(ms / 86400000).toFixed(1)}d`
}

export function AnalyticsDashboardWidget({ data }: { data: AnalyticsDashboardData | null }) {
  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-6 p-6">
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

      {data.definitionBreakdown.length > 0 && (
        <details open>
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <svg
              className="text-muted-foreground size-4 shrink-0 transition-transform [[open]>&]:rotate-90"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
            </svg>
            <h3 className="text-lg font-medium">By Process Definition</h3>
            <Badge variant="secondary">{data.definitionBreakdown.length}</Badge>
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            {data.definitionBreakdown.map((def) => (
              <Card key={def.processDefinitionKey} className="gap-0 py-0 shadow-none">
                <CardContent className="flex items-center justify-between p-3">
                  <span className="font-mono text-sm font-medium">{def.processDefinitionKey}</span>
                  <div className="text-muted-foreground flex items-center gap-4 text-sm">
                    <span>{def.totalInstances} total</span>
                    <span className="text-success-foreground">{def.completed} completed</span>
                    <span className="text-info-foreground">{def.running} running</span>
                    {def.failed > 0 && <Badge variant="destructive">{def.failed} failed</Badge>}
                    <span>avg {formatDuration(def.avgDurationMs)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </details>
      )}

      {data.activityBreakdown.length > 0 && (
        <details open>
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <svg
              className="text-muted-foreground size-4 shrink-0 transition-transform [[open]>&]:rotate-90"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
            </svg>
            <h3 className="text-lg font-medium">Activity Bottlenecks</h3>
            <Badge variant="secondary">{data.activityBreakdown.length}</Badge>
          </summary>
          <div className="mt-3 rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activity</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Executions</TableHead>
                  <TableHead className="text-right">Avg</TableHead>
                  <TableHead className="text-right">P95</TableHead>
                  <TableHead className="text-right">Total Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.activityBreakdown.map((act) => (
                  <TableRow key={act.activityId}>
                    <TableCell className="font-mono text-sm">
                      {act.activityName || act.activityId}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{act.activityType}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{act.executionCount}</TableCell>
                    <TableCell className="text-right">
                      {formatDuration(act.avgDurationMs)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatDuration(act.p95DurationMs)}
                    </TableCell>
                    <TableCell className="text-right">{formatDuration(act.totalTimeMs)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      )}
    </div>
  )
}
