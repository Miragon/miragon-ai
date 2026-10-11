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
import {
  HandOffButton,
  Section,
  WidgetShell,
  formatDuration,
  formatNumber,
} from "@miragon-ai/widget-shell/widgets"
import type { AnalyticsDashboardData } from "@miragon-ai/analytics-client"
import { useDashboardSelfFetch, type DashboardScopeProps } from "./lib.js"
import { QueryGate } from "../query-gate.js"
import { useT } from "../../messages/use-t.js"
import { engineIdsOf, useHandOff, type HandOff } from "../hand-off.js"

type ActivityRow = AnalyticsDashboardData["activityBreakdown"][number]

/**
 * Why ONE activity of one process is a bottleneck — over the scope of the
 * data on screen (its `engines` and `period` echo), so the follow-up reads
 * exactly the numbers shown.
 */
export function activityBottleneckHandOff(
  act: ActivityRow,
  data: Pick<AnalyticsDashboardData, "engines" | "period">,
): HandOff {
  return {
    intent: "askAi.activityBottleneck",
    ids: {
      engine: engineIdsOf(data.engines),
      processDefinitionKey: act.processDefinitionKey,
      period: data.period,
    },
    // Durations are null when nothing ended in the window — left out, never 0.
    facts: {
      activityId: act.activityId,
      activityType: act.activityType,
      executionCount: act.executionCount,
      avgDurationMs: act.avgDurationMs,
      p95DurationMs: act.p95DurationMs,
      totalTimeMs: act.totalTimeMs,
    },
    tools: ["analytics_element_bottleneck", "analytics_analyze_process_performance"],
  }
}

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
  const { ask } = useHandOff()
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
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(act.executionCount)}
                        </TableCell>
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
                          <HandOffButton
                            action="explainBottleneck"
                            variant="icon"
                            prompt={ask(activityBottleneckHandOff(act, data))}
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
