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
import { AskAiButton, Section, WidgetShell, formatDuration } from "@miragon-ai/widget-shell/widgets"
import type { AnalyticsDashboardData } from "@miragon-ai/client-analytics"
import { useDashboardSelfFetch, type AnalyticsDashboardPeriod } from "./lib.js"
import { QueryGate } from "../query-gate.js"
import { useT } from "../../messages/use-t.js"

export function ActivityBottleneckTable({
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

  return (
    <QueryGate
      initialData={initialData}
      query={fallbackQuery}
      skeleton={
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      }
    >
      {(data) =>
        data.activityBreakdown.length === 0 ? (
          <WidgetShell>
            <Alert>
              <AlertDescription>{t("aBottleneck.emptyState")}</AlertDescription>
            </Alert>
          </WidgetShell>
        ) : (
          <WidgetShell>
            <Section
              title={t("aBottleneck.heading")}
              count={data.activityBreakdown.length}
              defaultOpen
            >
              <div className="border-border rounded-lg border">
                <Table aria-label={t("aBottleneck.tableLabel")}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{t("aBottleneck.colActivity")}</TableHead>
                      <TableHead scope="col">{t("aBottleneck.colType")}</TableHead>
                      <TableHead scope="col" className="text-right">
                        {t("aBottleneck.colExecutions")}
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        {t("aBottleneck.colAvg")}
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        {t("aBottleneck.colP95")}
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        {t("aBottleneck.colTotalTime")}
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
                        <TableCell className="text-right">
                          {formatDuration(act.avgDurationMs)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatDuration(act.p95DurationMs)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatDuration(act.totalTimeMs)}
                        </TableCell>
                        <TableCell className="text-right">
                          <AskAiButton
                            variant="icon"
                            label={t("aBottleneck.analyzeLabel")}
                            title={t("aBottleneck.analyzeLabel")}
                            prompt={`Explain in plain language why activity "${act.activityName || act.activityId}" (id ${act.activityId}, type ${act.activityType})${processDefinitionKey ? ` of process definition key "${processDefinitionKey}"` : " (cluster-wide, all process definitions)"} on the current engine is a bottleneck over the ${period ?? "7d"} window. On-screen for this activity: executionCount=${act.executionCount}, avgDurationMs=${act.avgDurationMs}, p95DurationMs=${act.p95DurationMs}, totalTimeMs=${act.totalTimeMs}. Use analytics_element_bottleneck${processDefinitionKey ? `({processDefinitionKey: "${processDefinitionKey}", activityId: "${act.activityId}", period: "${period ?? "7d"}"})` : ` (activityId "${act.activityId}", per relevant process definition)`} and, if you need process-level context, analytics_analyze_process_performance${processDefinitionKey ? `({processDefinitionKey: "${processDefinitionKey}", period: "${period ?? "7d"}"})` : ""}. Tell me (1) whether the cost is driven by high per-execution duration (avg/p95) or by sheer execution count, (2) whether the wait is most likely wait time (async/external task, job queue, message/timer) vs compute time inside the activity given its type "${act.activityType}", and (3) the single most impactful thing to look at next. Explanation only — do not change anything.`}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Section>
          </WidgetShell>
        )
      }
    </QueryGate>
  )
}
