import {
  HandOffButton,
  ViewMeta,
  WidgetShell,
  formatNumber,
} from "@miragon-ai/widget-shell/widgets"
import type { FailureDashboardData } from "@miragon-ai/analytics-client"
import { KpiGrid, KpiGridSkeleton, WidgetHeader, cn, type KpiCell } from "@miragon/mcp-toolkit-ui"
import { useFailureDashboardSelfFetch, type FailureScopeProps, type FailureView } from "./lib.js"
import { QueryGate } from "../query-gate.js"
import { useT, type T } from "../../messages/use-t.js"
import { processNameOf } from "../../bpmn-names.js"
import { engineIdsOf, useHandOff, type HandOff } from "../hand-off.js"
import { enginesMeta } from "../view-meta.js"

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

/**
 * The most affected process as a figure: its name (the key below it, quiet),
 * or the key alone in mono when the model's name is unknown; "—" without one.
 */
function mostAffectedCell(t: T, data: FailureView): KpiCell {
  const key = data.mostAffectedProcess
  const name = key ? processNameOf(data.names, key) : null
  return {
    label: t("aFailureSummary.mostAffected"),
    value: (
      <span className={cn("text-section block break-words", !name && key && "font-mono")}>
        {name ?? key ?? "—"}
      </span>
    ),
    trend: name ? <span className="font-mono break-all">{key}</span> : undefined,
  }
}

export function FailureSummaryKpi({
  data: initialData,
  engine,
}: { data: FailureView | null } & FailureScopeProps) {
  const fallbackQuery = useFailureDashboardSelfFetch(initialData, { engine })
  const t = useT()
  const { ask } = useHandOff()

  return (
    <QueryGate
      initialData={initialData}
      query={fallbackQuery}
      header={<WidgetHeader title={t("aFailureSummary.title")} />}
      skeleton={<KpiGridSkeleton cells={3} boxed />}
    >
      {(data) => (
        <WidgetShell>
          <WidgetHeader
            title={t("aFailureSummary.title")}
            // A live snapshot: no period, the engines and when it was read.
            sub={<ViewMeta engines={enginesMeta(data.engines)} asOf={data.asOf} />}
            actions={
              <HandOffButton
                action="prioritize"
                variant="primary"
                prompt={ask(failureSummaryHandOff(data))}
              />
            }
          />
          {/* The dashboards' one KPI pattern (U14): a neutral strip, the state
              as a dot. Only an open incident is a state (danger); how many
              groups they form and which process has the most are neutral. */}
          <KpiGrid
            boxed
            ariaLabel={t("aFailureSummary.summaryAriaLabel")}
            cells={[
              {
                label: t("aFailureSummary.totalIncidents"),
                value: formatNumber(data.totalIncidents),
                tone: data.totalIncidents > 0 ? "danger" : undefined,
              },
              {
                label: t("aFailureSummary.uniqueErrorPatterns"),
                value: formatNumber(data.uniqueErrorPatterns),
              },
              mostAffectedCell(t, data),
            ]}
          />
        </WidgetShell>
      )}
    </QueryGate>
  )
}
