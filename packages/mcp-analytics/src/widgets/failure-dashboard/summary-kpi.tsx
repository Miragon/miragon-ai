import { Card, CardContent, Alert, AlertDescription, Skeleton } from "@miragon/mcp-toolkit-ui"
import { WidgetShell, AskAiButton } from "@miragon-ai/widget-shell/widgets"
import type { FailureDashboardData } from "@miragon-ai/client-analytics"
import { useFailureDashboardSelfFetch } from "./lib.js"
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
  const data = initialData ?? fallbackQuery.data ?? null
  const t = useT()

  if (!data) {
    return (
      <WidgetShell>
        {fallbackQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{fallbackQuery.error.message}</AlertDescription>
          </Alert>
        ) : (
          <div
            className="grid grid-cols-3 gap-4"
            aria-label={t("aFailureSummary.loadingAriaLabel")}
            aria-busy="true"
          >
            {[0, 1, 2].map((i) => (
              <Card key={i} className="gap-0 py-0 shadow-none">
                <CardContent className="space-y-2 p-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-7 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </WidgetShell>
    )
  }
  return (
    <WidgetShell>
      <div className="mb-4 flex items-center justify-end">
        <AskAiButton variant="primary" prompt={buildAnalyzeFailuresPrompt(data)} />
      </div>
      <div className="grid grid-cols-3 gap-4" aria-label={t("aFailureSummary.summaryAriaLabel")}>
        <Card className="bg-critical-soft gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-critical text-sm font-medium">
              {t("aFailureSummary.totalIncidents")}
            </p>
            <p className="text-critical text-2xl font-bold">{data.totalIncidents}</p>
          </CardContent>
        </Card>
        <Card className="bg-warning-soft gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-warning text-sm font-medium">
              {t("aFailureSummary.uniqueErrorPatterns")}
            </p>
            <p className="text-warning text-2xl font-bold">{data.uniqueErrorPatterns}</p>
          </CardContent>
        </Card>
        <Card className="bg-m-blue-soft gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-m-blue text-sm font-medium">{t("aFailureSummary.mostAffected")}</p>
            <p className="text-m-blue truncate font-mono text-lg font-bold">
              {data.mostAffectedProcess ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>
    </WidgetShell>
  )
}
