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
  Skeleton,
} from "@miragon/mcp-toolkit-ui"
import { AskAiButton, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { AnalyticsDashboardData } from "@miragon-ai/client-analytics"
import { formatDuration, useDashboardSelfFetch, type AnalyticsDashboardPeriod } from "./lib.js"

export function ActivityBottleneckTable({
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
        {fallbackQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{fallbackQuery.error.message}</AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        )}
      </WidgetShell>
    )
  }

  if (data.activityBreakdown.length === 0) {
    return (
      <WidgetShell>
        <Alert>
          <AlertDescription>No activity executions in the selected window.</AlertDescription>
        </Alert>
      </WidgetShell>
    )
  }

  return (
    <WidgetShell>
      <details open>
        <summary className="focus-visible:ring-ring flex cursor-pointer list-none items-center gap-2 rounded outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
          <svg
            className="text-muted-foreground size-4 shrink-0 transition-transform [[open]>&]:rotate-90"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
          </svg>
          <h3 className="text-lg font-medium">Activity Bottlenecks</h3>
          <Badge variant="secondary">{data.activityBreakdown.length}</Badge>
        </summary>
        <div className="border-border mt-3 rounded-lg border">
          <Table aria-label="Activity bottlenecks by total execution time">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Activity</TableHead>
                <TableHead scope="col">Type</TableHead>
                <TableHead scope="col" className="text-right">
                  Executions
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Avg
                </TableHead>
                <TableHead scope="col" className="text-right">
                  P95
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Total Time
                </TableHead>
                <TableHead scope="col" className="w-px" />
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
                  <TableCell className="text-right">
                    <AskAiButton
                      variant="icon"
                      label="Investigate bottleneck"
                      title="Investigate bottleneck"
                      prompt={`Explain in plain language why activity "${act.activityName || act.activityId}" (id ${act.activityId}, type ${act.activityType})${processDefinitionKey ? ` of process definition key "${processDefinitionKey}"` : " (cluster-wide, all process definitions)"} on the current engine is a bottleneck over the ${period ?? "7d"} window. On-screen for this activity: executionCount=${act.executionCount}, avgDurationMs=${act.avgDurationMs}, p95DurationMs=${act.p95DurationMs}, totalTimeMs=${act.totalTimeMs}. Use analytics_element_bottleneck${processDefinitionKey ? `({processDefinitionKey: "${processDefinitionKey}", activityId: "${act.activityId}", period: "${period ?? "7d"}"})` : ` (activityId "${act.activityId}", per relevant process definition)`} and, if you need process-level context, analytics_analyze_process_performance${processDefinitionKey ? `({processDefinitionKey: "${processDefinitionKey}", period: "${period ?? "7d"}"})` : ""}. Tell me (1) whether the cost is driven by high per-execution duration (avg/p95) or by sheer execution count, (2) whether the wait is most likely wait time (async/external task, job queue, message/timer) vs compute time inside the activity given its type "${act.activityType}", and (3) the single most impactful thing to look at next. Explanation only — do not change anything.`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </WidgetShell>
  )
}
