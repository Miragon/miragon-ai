import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@miragon/mcp-toolkit-ui"
import {
  AskAiButton,
  CountPill,
  Section,
  TableEmptyState,
  TableSkeleton,
  WidgetShell,
} from "@miragon-ai/widget-shell/widgets"
import type { FailureDashboardData, ProcessFailureItem } from "@miragon-ai/analytics-client"
import { useFailureDashboardSelfFetch, type FailureScopeProps } from "./lib.js"
import { QueryGate } from "../query-gate.js"
import { useT } from "../../messages/use-t.js"

/**
 * The per-process Ask-AI prompt. The regression check goes to the tools that
 * measure incident rates over time — analytics_version_compare cannot split
 * incidents by version, so its incident rates are null (#327).
 */
export function failureRateAskAiPrompt(proc: ProcessFailureItem): string {
  const key = proc.processDefinitionKey
  const rate = proc.incidentRatePct === null ? "n/a" : `${proc.incidentRatePct}`
  return `Explain in plain language why process definition "${key}" on the current engine has ${proc.openIncidents} open incident(s) right now (${rate} per 100 of its ${proc.runningNow} running instances, ${proc.deadJobs} dead job(s)). Determine whether this is a regression by comparing recent time periods with analytics_compare_execution_periods (processDefinitionKey "${key}") or, around a deployment, the windows before and after it with analytics_cluster_compare (processDefinitionKey "${key}"), and identify the dominant failing activity with analytics_element_bottleneck (processDefinitionKey "${key}"). Summarize what is driving these incidents. Explanation only — do not change anything.`
}

export function FailureRateTable({
  data: initialData,
  engine,
}: { data: FailureDashboardData | null } & FailureScopeProps) {
  const fallbackQuery = useFailureDashboardSelfFetch(initialData, { engine })
  const t = useT()
  return (
    <QueryGate initialData={initialData} query={fallbackQuery} skeleton={<TableSkeleton />}>
      {(data) =>
        data.processBreakdown.length === 0 ? (
          <WidgetShell>
            <TableEmptyState>{t("aFailureRate.emptyState")}</TableEmptyState>
          </WidgetShell>
        ) : (
          <WidgetShell>
            <Section
              title={t("aFailureRate.heading")}
              count={data.processBreakdown.length}
              defaultOpen
            >
              <div className="rounded-lg border">
                <Table aria-label={t("aFailureRate.tableLabel")}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{t("aFailureRate.colProcess")}</TableHead>
                      <TableHead scope="col" className="text-right">
                        {t("aFailureRate.colRunningNow")}
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        {t("aFailureRate.colOpenIncidents")}
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        {t("aFailureRate.colDeadJobs")}
                      </TableHead>
                      <TableHead scope="col">{t("aFailureRate.colIncidentRate")}</TableHead>
                      <TableHead scope="col" className="text-right">
                        <span className="sr-only">{t("aFailureRate.colAi")}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.processBreakdown.map((proc) => (
                      <TableRow key={proc.processDefinitionKey}>
                        <TableCell className="font-mono text-sm font-medium">
                          {proc.processDefinitionKey}
                        </TableCell>
                        <TableCell className="text-right">{proc.runningNow}</TableCell>
                        <TableCell className="text-right">
                          <CountPill tone="critical">{proc.openIncidents}</CountPill>
                        </TableCell>
                        <TableCell className="text-right">{proc.deadJobs}</TableCell>
                        <TableCell>
                          {proc.incidentRatePct === null ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="bg-muted h-2 w-24 overflow-hidden rounded-full">
                                <div
                                  className="bg-critical h-full rounded-full"
                                  style={{ width: `${Math.min(100, proc.incidentRatePct)}%` }}
                                />
                              </div>
                              <span className="text-muted-foreground text-xs tabular-nums">
                                {proc.incidentRatePct}%
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <AskAiButton
                            variant="icon"
                            title={t("aFailureRate.analyzeLabel")}
                            label={t("aFailureRate.analyzeLabel")}
                            prompt={failureRateAskAiPrompt(proc)}
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
