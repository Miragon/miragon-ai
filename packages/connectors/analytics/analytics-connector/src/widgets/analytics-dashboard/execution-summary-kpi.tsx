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
import { engineIdsOf, useHandOff, type HandOff } from "../hand-off.js"

/**
 * Assess the dashboard on screen — its echoed scope (process, period,
 * engines) as ids, its headline numbers as facts named for what they measure:
 * window flows (`…InWindow`; incidents, not failed instances) apart from the
 * live gauges (`…Now`). A figure that was not measured is null and left out,
 * never stated as 0 (#336).
 */
export function executionSummaryHandOff(data: AnalyticsDashboardData): HandOff {
  return {
    intent: "askAi.executionSummary",
    ids: {
      engine: engineIdsOf(data.engines),
      processDefinitionKey: data.processDefinitionKey ?? undefined,
      period: data.period,
    },
    facts: {
      startedInWindow: data.totalCount,
      completedInWindow: data.completedCount,
      incidentsCreatedInWindow: data.incidentsCreated,
      incidentsResolvedInWindow: data.incidentsResolved,
      incidentRatePct: data.incidentRatePct,
      avgDurationMs: data.avgDurationMs,
      p95DurationMs: data.p95DurationMs,
      runningNow: data.runningNow,
      openIncidentsNow: data.openIncidentsNow,
    },
    tools: ["analytics_analyze_process_performance", "analytics_find_failed_instances"],
  }
}

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
  const { ask } = useHandOff()

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
            actions={<AskAiButton variant="primary" prompt={ask(executionSummaryHandOff(data))} />}
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
