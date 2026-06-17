import { Alert, AlertDescription, Skeleton } from "@miragon/mcp-toolkit-ui"
import { AskAiButton, KpiGrid, WidgetHeader, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { AnalyticsDashboardData } from "@miragon-ai/client-analytics"
import { useDashboardSelfFetch, type AnalyticsDashboardPeriod } from "./lib.js"
import { useT } from "../../messages/use-t.js"

export function ExecutionSummaryKpi({
  data: initialData,
  processDefinitionKey,
  period,
}: {
  data: AnalyticsDashboardData | null
  processDefinitionKey?: string
  period?: AnalyticsDashboardPeriod
}) {
  const fallbackQuery = useDashboardSelfFetch(initialData, { processDefinitionKey, period })
  const t = useT()
  const data = initialData ?? fallbackQuery.data ?? null

  if (!data) {
    return (
      <WidgetShell>
        <WidgetHeader icon="▤" iconTone="info" title={t("aExecSummary.title")} />
        {fallbackQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{fallbackQuery.error.message}</AlertDescription>
          </Alert>
        ) : (
          <div className="border-border grid grid-cols-2 gap-px overflow-hidden rounded-lg border sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-card px-5 py-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2 h-7 w-12" />
              </div>
            ))}
          </div>
        )}
      </WidgetShell>
    )
  }

  return (
    <WidgetShell>
      <WidgetHeader
        icon="▤"
        iconTone="info"
        title={t("aExecSummary.title")}
        actions={
          <AskAiButton
            variant="primary"
            prompt={`Analyze the health of the process-analytics dashboard currently on screen${processDefinitionKey ? ` scoped to process definition key "${processDefinitionKey}"` : " (cluster-wide, all process definitions)"} over the ${period ?? "default (7d)"} window. Use analytics_analyze_process_performance${processDefinitionKey ? `({processDefinitionKey: "${processDefinitionKey}", period: "${period ?? "7d"}"})` : " per top process definition"} and, if there is open failure, analytics_find_failed_instances({processDefinitionKey: "${processDefinitionKey ?? ""}"}). On-screen summary: totalCount=${data.totalCount}, completedCount=${data.completedCount}, runningCount=${data.runningCount}, failedCount=${data.failedCount}, incidentCount=${data.incidentCount}, avgDurationMs=${data.avgDurationMs}, p95DurationMs=${data.p95DurationMs}, failureRatePct=${data.failureRatePct}. Interpret these correctly: failedCount and failureRatePct are incident-increase over the window and read ~0 on backdated/seed data; incidentCount is currently-open net (created minus resolved); runningCount is derived (started minus ended). Tell me (1) whether this is healthy or degrading, (2) the most likely root cause if incidentCount or failureRatePct is non-zero, and (3) the single highest-value next action. Be concise; do not restate the raw numbers back to me.`}
          />
        }
      />
      <KpiGrid
        boxed
        header={{ label: t("aExecSummary.headerExecutionSummary") }}
        cells={[
          { label: t("aExecSummary.cellTotal"), value: data.totalCount },
          {
            label: t("aExecSummary.cellCompleted"),
            value: data.completedCount,
            tone: data.completedCount > 0 ? "success" : undefined,
          },
          {
            label: t("aExecSummary.cellRunning"),
            value: data.runningCount,
            tone: data.runningCount > 0 ? "info" : undefined,
          },
          {
            label: t("aExecSummary.cellFailed"),
            value: data.failedCount,
            tone: data.failedCount > 0 ? "critical" : undefined,
          },
          {
            label: t("aExecSummary.cellIncidents"),
            value: data.incidentCount,
            tone: data.incidentCount > 0 ? "critical" : undefined,
          },
        ]}
      />
    </WidgetShell>
  )
}
