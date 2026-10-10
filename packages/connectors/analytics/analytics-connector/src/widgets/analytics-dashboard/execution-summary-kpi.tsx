import {
  AskAiButton,
  KpiGrid,
  KpiGridSkeleton,
  WidgetHeader,
  WidgetShell,
} from "@miragon-ai/widget-shell/widgets"
import type { AnalyticsDashboardData } from "@miragon-ai/analytics-client"
import { useDashboardSelfFetch, type DashboardScopeProps } from "./lib.js"
import { QueryGate } from "../query-gate.js"
import { useT } from "../../messages/use-t.js"

/** A live gauge without a series is "not reported" — an em-dash, never a plausible 0. */
const live = (value: number | null) => value ?? "—"

export function ExecutionSummaryKpi({
  data: initialData,
  processDefinitionKey,
  period,
  engine,
}: { data: AnalyticsDashboardData | null } & DashboardScopeProps) {
  const fallbackQuery = useDashboardSelfFetch(initialData, { processDefinitionKey, period, engine })
  const t = useT()

  return (
    <QueryGate
      initialData={initialData}
      query={fallbackQuery}
      header={<WidgetHeader icon="▤" iconTone="info" title={t("aExecSummary.title")} />}
      skeleton={<KpiGridSkeleton cells={5} boxed />}
    >
      {(data) => (
        <WidgetShell>
          <WidgetHeader
            icon="▤"
            iconTone="info"
            title={t("aExecSummary.title")}
            actions={
              <AskAiButton
                variant="primary"
                prompt={`Analyze the health of the process-analytics dashboard currently on screen${processDefinitionKey ? ` scoped to process definition key "${processDefinitionKey}"` : " (cluster-wide, all process definitions)"} over the ${data.period} window. Use analytics_analyze_process_performance${processDefinitionKey ? `({processDefinitionKey: "${processDefinitionKey}", period: "${data.period}"})` : " per top process definition"} and, if there is open failure, analytics_find_failed_instances${processDefinitionKey ? `({processDefinitionKey: "${processDefinitionKey}"})` : ""}. On-screen summary: startedInWindow=${data.totalCount}, completedInWindow=${data.completedCount}, incidentsCreatedInWindow=${data.incidentsCreated}, incidentRatePct=${data.incidentRatePct}, avgDurationMs=${data.avgDurationMs}, p95DurationMs=${data.p95DurationMs}, runningNow=${data.runningNow}, openIncidentsNow=${data.openIncidentsNow}. Interpret these correctly: the *InWindow figures are flows within the window (incidents, not failed instances — incidentRatePct is incidents per 100 started and can exceed 100); the durations cover only the instances that ended in the window; runningNow and openIncidentsNow are the live gauges right now, independent of the window; null means not measured, not zero. Tell me (1) whether this is healthy or degrading, (2) the most likely root cause if openIncidentsNow or incidentRatePct is non-zero, and (3) the single highest-value next action. Be concise; do not restate the raw numbers back to me.`}
              />
            }
          />
          <KpiGrid
            boxed
            header={{ label: t("aExecSummary.headerExecutionSummary") }}
            cells={[
              { label: t("aExecSummary.cellStarted"), value: data.totalCount },
              {
                label: t("aExecSummary.cellCompleted"),
                value: data.completedCount,
                tone: data.completedCount > 0 ? "success" : undefined,
              },
              {
                label: t("aExecSummary.cellIncidentsCreated"),
                value: data.incidentsCreated,
                tone: data.incidentsCreated > 0 ? "warning" : undefined,
              },
              {
                label: t("aExecSummary.cellRunningNow"),
                value: live(data.runningNow),
                tone: (data.runningNow ?? 0) > 0 ? "info" : undefined,
              },
              {
                label: t("aExecSummary.cellOpenIncidentsNow"),
                value: live(data.openIncidentsNow),
                tone: (data.openIncidentsNow ?? 0) > 0 ? "critical" : undefined,
              },
            ]}
          />
        </WidgetShell>
      )}
    </QueryGate>
  )
}
