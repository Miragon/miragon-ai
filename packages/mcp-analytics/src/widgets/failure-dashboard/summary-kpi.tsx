import {
  AskAiButton,
  KpiGrid,
  KpiGridSkeleton,
  WidgetHeader,
  WidgetShell,
} from "@miragon-ai/widget-shell/widgets"
import type { FailureDashboardData } from "@miragon-ai/client-analytics"
import { useFailureDashboardSelfFetch } from "./lib.js"
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
        `"${p.incidentMessage}" at activity ${p.activityId} in process ${p.processDefinitionKey} (${p.incidentCount}×, first ${p.firstOccurrence}, last ${p.lastOccurrence}, sample instances ${p.sampleInstanceIds.join(", ")})`,
    )
    .join("; ")
  const processBreakdown = data.processBreakdown
    .map(
      (b) =>
        `${b.processDefinitionKey}: ${b.failedCount} failed / ${b.totalInstances} total = ${b.failureRatePct}%, ${b.incidentCount} incidents`,
    )
    .join("; ")
  return `Triage the current open-incident snapshot from the failure dashboard. There are ${data.totalIncidents} open incidents across ${data.uniqueErrorPatterns} distinct error patterns; the most affected process is \`${data.mostAffectedProcess ?? "unknown"}\`. The top error patterns are: ${errorPatterns}. The per-process failure breakdown is: ${processBreakdown}. Group the patterns by likely common cause, distinguish a broad systemic outage (one cause spanning many processes) from isolated per-process bugs, and give a ranked, prioritized action list (which patterns to fix first and why) using their incidentCount, failureRatePct and recency. Confirm with the live engine state via analytics_find_failed_instances and camunda7_list_incidents before recommending, since this snapshot is point-in-time across all engines. Do not mutate anything — analysis only.`
}

export function FailureSummaryKpi({ data: initialData }: { data: FailureDashboardData | null }) {
  const fallbackQuery = useFailureDashboardSelfFetch(initialData)
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
