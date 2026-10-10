import {
  AskAiButton,
  KpiGrid,
  KpiGridSkeleton,
  WidgetHeader,
  WidgetShell,
} from "@miragon-ai/widget-shell/widgets"
import type { FailureDashboardData } from "@miragon-ai/analytics-client"
import { useFailureDashboardSelfFetch, type FailureScopeProps } from "./lib.js"
import { QueryGate } from "../query-gate.js"
import { useT } from "../../messages/use-t.js"
import { engineIdsOf, useHandOff, type HandOff } from "../hand-off.js"

/**
 * Triage of the open-incident snapshot. Only the headline numbers travel —
 * the patterns themselves are read through the tools (bounded, and their
 * messages stay tool output instead of the user's own words).
 */
export function failureSummaryHandOff(data: FailureDashboardData): HandOff {
  return {
    intent: "askAi.failureSummary",
    ids: { engine: engineIdsOf(data.engines) },
    facts: {
      openIncidentsNow: data.totalIncidents,
      incidentGroups: data.uniqueErrorPatterns,
      mostAffectedProcess: data.mostAffectedProcess,
    },
    tools: [
      "analytics_find_failed_instances",
      "analytics_show_failure_dashboard",
      "camunda7_list_incidents",
      "camunda7_query_historic_incidents",
    ],
  }
}

export function FailureSummaryKpi({
  data: initialData,
  engine,
}: { data: FailureDashboardData | null } & FailureScopeProps) {
  const fallbackQuery = useFailureDashboardSelfFetch(initialData, { engine })
  const t = useT()
  const { ask } = useHandOff()

  return (
    <QueryGate
      initialData={initialData}
      query={fallbackQuery}
      header={<WidgetHeader title={t("aFailureSummary.title")} />}
      skeleton={<KpiGridSkeleton cells={3} variant="soft" />}
    >
      {(data) => (
        <WidgetShell>
          <WidgetHeader
            title={t("aFailureSummary.title")}
            actions={<AskAiButton variant="primary" prompt={ask(failureSummaryHandOff(data))} />}
          />
          <KpiGrid
            variant="soft"
            ariaLabel={t("aFailureSummary.summaryAriaLabel")}
            cells={[
              {
                label: t("aFailureSummary.totalIncidents"),
                value: data.totalIncidents,
                tone: "danger",
              },
              {
                label: t("aFailureSummary.uniqueErrorPatterns"),
                value: data.uniqueErrorPatterns,
                tone: "warning",
              },
              {
                label: t("aFailureSummary.mostAffected"),
                value: (
                  <span className="block truncate font-mono text-lg">
                    {data.mostAffectedProcess ?? "—"}
                  </span>
                ),
                tone: "info",
              },
            ]}
          />
        </WidgetShell>
      )}
    </QueryGate>
  )
}
