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

/**
 * Build the self-contained cross-pattern triage prompt for the surface-level
 * "✦ Analyze failures" handoff. Every concrete id/number is inlined here so the
 * agent gets the full point-in-time snapshot without relying on ambient context.
 * The failure dashboard is cross-engine (no single engine in scope), so the
 * prompt asks the agent to confirm live state across engines itself.
 */
function buildAnalyzeFailuresPrompt(data: FailureDashboardData): string {
  const errorPatterns = data.errorPatterns
    .map(
      (p) =>
        `${p.incidentCount} open "${p.incidentType}" incident(s) in process ${p.processDefinitionKey}`,
    )
    .join("; ")
  const processBreakdown = data.processBreakdown
    .map(
      (b) =>
        `${b.processDefinitionKey}: ${b.openIncidents} open incident(s), ${b.deadJobs} dead job(s), ${b.runningNow} running (${b.incidentRatePct ?? "n/a"} open incidents per 100 running)`,
    )
    .join("; ")
  return `Triage the current open-incident snapshot from the failure dashboard. There are ${data.totalIncidents} open incidents in ${data.uniqueErrorPatterns} groups by incident type and process; the most affected process is \`${data.mostAffectedProcess ?? "unknown"}\`. The groups are: ${errorPatterns}. The per-process breakdown is: ${processBreakdown}. The metric carries no incident message, activity or timestamps — read those from the live incidents. Group the incidents by likely common cause, distinguish a broad systemic outage (one cause spanning many processes) from isolated per-process bugs, and give a ranked, prioritized action list (which groups to fix first and why) using their incidentCount and incidentRatePct. Confirm with the live engine state via analytics_find_failed_instances and camunda7_list_incidents before recommending, since this snapshot is point-in-time across all engines. Do not mutate anything — analysis only.`
}

export function FailureSummaryKpi({
  data: initialData,
  engine,
}: { data: FailureDashboardData | null } & FailureScopeProps) {
  const fallbackQuery = useFailureDashboardSelfFetch(initialData, { engine })
  const t = useT()

  return (
    <QueryGate
      initialData={initialData}
      query={fallbackQuery}
      header={<WidgetHeader icon="⚠" iconTone="critical" title={t("aFailureSummary.title")} />}
      skeleton={<KpiGridSkeleton cells={3} variant="soft" />}
    >
      {(data) => (
        <WidgetShell>
          <WidgetHeader
            icon="⚠"
            iconTone="critical"
            title={t("aFailureSummary.title")}
            actions={<AskAiButton variant="primary" prompt={buildAnalyzeFailuresPrompt(data)} />}
          />
          <KpiGrid
            variant="soft"
            ariaLabel={t("aFailureSummary.summaryAriaLabel")}
            cells={[
              {
                label: t("aFailureSummary.totalIncidents"),
                value: data.totalIncidents,
                tone: "critical",
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
