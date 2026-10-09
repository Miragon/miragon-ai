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
import { useFailureDashboardSelfFetch } from "./lib.js"
import { QueryGate } from "../query-gate.js"
import { useT } from "../../messages/use-t.js"

/**
 * The per-process Ask-AI prompt. The regression check goes to the tools that
 * measure failure rates over time — analytics_version_compare cannot split
 * incidents by version, so its failure rates are null (#327).
 */
export function failureRateAskAiPrompt(proc: ProcessFailureItem): string {
  const key = proc.processDefinitionKey
  return `Explain in plain language why process definition "${key}" on the current engine shows a ${proc.failureRatePct}% failure rate (${proc.failedCount} failed and ${proc.incidentCount} incident(s) out of ${proc.totalInstances} instances). Determine whether this is a regression by comparing recent time periods with analytics_compare_execution_periods (processDefinitionKey "${key}") or, around a deployment, the windows before and after it with analytics_cluster_compare (processDefinitionKey "${key}"), and identify the dominant failing activity with analytics_element_bottleneck (processDefinitionKey "${key}"). Summarize what is driving this failure rate. Explanation only — do not change anything.`
}

export function FailureRateTable({ data: initialData }: { data: FailureDashboardData | null }) {
  const fallbackQuery = useFailureDashboardSelfFetch(initialData)
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
                        {t("aFailureRate.colTotal")}
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        {t("aFailureRate.colFailed")}
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        {t("aFailureRate.colIncidents")}
                      </TableHead>
                      <TableHead scope="col">{t("aFailureRate.colFailureRate")}</TableHead>
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
                        <TableCell className="text-right">{proc.totalInstances}</TableCell>
                        <TableCell className="text-right">
                          <CountPill tone="critical">{proc.failedCount}</CountPill>
                        </TableCell>
                        <TableCell className="text-right">{proc.incidentCount}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="bg-muted h-2 w-24 overflow-hidden rounded-full">
                              <div
                                className="bg-critical h-full rounded-full"
                                style={{ width: `${Math.min(100, proc.failureRatePct)}%` }}
                              />
                            </div>
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {proc.failureRatePct}%
                            </span>
                          </div>
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
