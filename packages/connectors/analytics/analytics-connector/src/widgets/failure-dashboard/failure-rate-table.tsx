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
import { engineIdsOf, useHandOff, type HandOff } from "../hand-off.js"

/**
 * What drives ONE process's open incidents right now (live gauges: open
 * incidents per 100 running instances, dead jobs — #336). The regression
 * check goes to the tools that measure incident rates over time —
 * analytics_version_compare cannot split incidents by version, so its
 * incident rates are null (#327).
 */
export function failureRateHandOff(
  proc: ProcessFailureItem,
  data: Pick<FailureDashboardData, "engines">,
): HandOff {
  return {
    intent: "askAi.failureRate",
    ids: { engine: engineIdsOf(data.engines), processDefinitionKey: proc.processDefinitionKey },
    // A rate over no running instance is null — left out, never a 0.
    facts: {
      openIncidentsNow: proc.openIncidents,
      runningNow: proc.runningNow,
      incidentRatePct: proc.incidentRatePct,
      deadJobs: proc.deadJobs,
    },
    tools: [
      "analytics_compare_execution_periods",
      "analytics_cluster_compare",
      "analytics_element_bottleneck",
    ],
  }
}

export function FailureRateTable({
  data: initialData,
  engine,
}: { data: FailureDashboardData | null } & FailureScopeProps) {
  const fallbackQuery = useFailureDashboardSelfFetch(initialData, { engine })
  const t = useT()
  const { ask } = useHandOff()
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
                            prompt={ask(failureRateHandOff(proc, data))}
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
