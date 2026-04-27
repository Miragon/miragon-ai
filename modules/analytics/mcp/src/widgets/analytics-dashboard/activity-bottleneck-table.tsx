import {
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Alert,
  AlertDescription,
  useToolQuery,
} from "@miragon/mcp-toolkit-ui"
import type { AnalyticsDashboardData } from "@miragon-ai/client-analytics"
import { formatDuration } from "./lib.js"

export function ActivityBottleneckTable({
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

  if (data.activityBreakdown.length === 0) return null

  return (
    <div className="bg-card text-card-foreground p-6">
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
                  <TableCell className="text-right">{formatDuration(act.avgDurationMs)}</TableCell>
                  <TableCell className="text-right">{formatDuration(act.p95DurationMs)}</TableCell>
                  <TableCell className="text-right">{formatDuration(act.totalTimeMs)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </div>
  )
}
