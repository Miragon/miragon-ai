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
import type { AnalyticsDashboardData } from "@miragon-ai/analytics-client"
import { useDashboardSelfFetch, type DashboardScopeProps } from "./lib.js"
import { QueryGate } from "../query-gate.js"
import { useT } from "../../messages/use-t.js"

/**
 * One row per (process, activity): BPMN ids are only unique within one model,
 * so the same id in two processes is two rows — the process column says which.
 */
export function ActivityBottleneckTable({
  data: initialData,
  processDefinitionKey,
  period,
  engine,
}: { data: AnalyticsDashboardData | null } & DashboardScopeProps) {
  const t = useT()
  const fallbackQuery = useDashboardSelfFetch(initialData, { processDefinitionKey, period, engine })

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
                      <TableHead scope="col">{t("aBottleneck.colProcess")}</TableHead>
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
                      <TableRow key={`${act.processDefinitionKey}:${act.activityId}`}>
                        <TableCell className="font-mono text-sm">
                          {act.processDefinitionKey}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{act.activityId}</TableCell>
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
                            prompt={`Explain in plain language why activity "${act.activityId}" (type ${act.activityType}) of process definition key "${act.processDefinitionKey}" on the current engine is a bottleneck over the ${data.period} window. On-screen for this activity: executionCount=${act.executionCount}, avgDurationMs=${act.avgDurationMs}, p95DurationMs=${act.p95DurationMs}, totalTimeMs=${act.totalTimeMs}. Use analytics_element_bottleneck({processDefinitionKey: "${act.processDefinitionKey}", period: "${data.period}"}) and find activity "${act.activityId}" in its ranking and, if you need process-level context, analytics_analyze_process_performance({processDefinitionKey: "${act.processDefinitionKey}", period: "${data.period}"}). Tell me (1) whether the cost is driven by high per-execution duration (avg/p95) or by sheer execution count, (2) whether the wait is most likely wait time (async/external task, job queue, message/timer) vs compute time inside the activity given its type "${act.activityType}", and (3) the single most impactful thing to look at next. Explanation only — do not change anything.`}
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
