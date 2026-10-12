import { TONE_DOT, cn } from "@miragon/mcp-toolkit-ui"
import {
  HandOffButton,
  ListTable,
  NamedId,
  Section,
  TableEmptyState,
  TableSkeleton,
  Td,
  WidgetShell,
  formatNumber,
  type ListTableColumn,
} from "@miragon-ai/widget-shell/widgets"
import type { FailureDashboardData, ProcessFailureItem } from "@miragon-ai/analytics-client"
import { useFailureDashboardSelfFetch, type FailureScopeProps, type FailureView } from "./lib.js"
import { QueryGate } from "../query-gate.js"
import { useT, type T } from "../../messages/use-t.js"
import { engineIdsOf, useHandOff, type HandOff } from "../hand-off.js"
import { processNameOf } from "../../bpmn-names.js"
import { Figure, FigureLegend, StateCount } from "../figure.js"

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

/**
 * The bar's length: the rate against the largest rate in the table, so
 * every bar is comparable and none is cut off. A rate of incidents per 100
 * running instances may pass 100 (one instance can carry several), which a
 * scale capped at 100 would hide.
 */
export function rateBarWidth(rate: number, max: number): number {
  if (!(max > 0) || !(rate > 0)) return 0
  return Math.min(100, (rate / max) * 100)
}

function columns(t: T): ListTableColumn[] {
  return [
    { label: t("aFailureRate.colProcess") },
    { label: t("aFailureRate.colRunningNow"), align: "right" },
    { label: t("aFailureRate.colOpenIncidents"), align: "right" },
    { label: t("aFailureRate.colDeadJobs"), align: "right" },
    { label: t("aFailureRate.colIncidentRate"), align: "right" },
    {
      label: <span className="sr-only">{t("aFailureRate.colAi")}</span>,
      plain: true,
      sticky: true,
    },
  ]
}

/**
 * The rate as a number over a bar. The bar is a magnitude, not a state: it
 * takes the data-viz blue (decision j), not the danger red. A rate is judged
 * only against a threshold or the period before (U17), and this live ratio
 * has neither; the open incidents beside it already carry the danger.
 */
function RateCell({ rate, max, t }: { rate: number | null; max: number; t: T }) {
  if (rate === null) return <Figure value={null} why={t("aFigure.noRate")} />
  return (
    <span className="ml-auto flex w-24 flex-col items-end gap-1">
      <span className="tabular-nums">{formatNumber(rate, { maximumFractionDigits: 1 })}</span>
      <span aria-hidden="true" className="bg-muted block h-1.5 w-full overflow-hidden rounded-full">
        <span
          className={cn("block h-full rounded-full", TONE_DOT.info)}
          style={{ width: `${rateBarWidth(rate, max)}%` }}
        />
      </span>
    </span>
  )
}

export function FailureRateTable({
  data: initialData,
  engine,
}: { data: FailureView | null } & FailureScopeProps) {
  const fallbackQuery = useFailureDashboardSelfFetch(initialData, { engine })
  const t = useT()
  const { ask } = useHandOff()
  return (
    <QueryGate initialData={initialData} query={fallbackQuery} skeleton={<TableSkeleton />}>
      {(data) => {
        if (data.processBreakdown.length === 0) {
          return (
            <WidgetShell>
              <TableEmptyState variant="done">{t("aFailureRate.emptyState")}</TableEmptyState>
            </WidgetShell>
          )
        }
        const max = Math.max(0, ...data.processBreakdown.map((p) => p.incidentRatePct ?? 0))
        return (
          <WidgetShell>
            <Section
              title={t("aFailureRate.heading")}
              count={data.processBreakdown.length}
              defaultOpen
            >
              <ListTable ariaLabel={t("aFailureRate.tableLabel")} columns={columns(t)}>
                {data.processBreakdown.map((proc) => (
                  <tr key={proc.processDefinitionKey}>
                    <Td>
                      <NamedId
                        name={processNameOf(data.names, proc.processDefinitionKey)}
                        id={proc.processDefinitionKey}
                      />
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {formatNumber(proc.runningNow)}
                    </Td>
                    {/* The states of a process (decision f), on the kit's one
                        ladder: open incidents and dead jobs (no retries left)
                        edged in danger while there are any, as camunda7 and
                        the landscape show them; none is a plain count. */}
                    <Td align="right" className="tabular-nums">
                      <StateCount value={proc.openIncidents} />
                    </Td>
                    <Td align="right" className="tabular-nums">
                      <StateCount value={proc.deadJobs} />
                    </Td>
                    <Td align="right">
                      <RateCell rate={proc.incidentRatePct} max={max} t={t} />
                    </Td>
                    <Td align="right">
                      <HandOffButton
                        action="findCause"
                        variant="icon"
                        prompt={ask(failureRateHandOff(proc, data))}
                      />
                    </Td>
                  </tr>
                ))}
              </ListTable>
              <FigureLegend
                reasons={[
                  data.processBreakdown.some((p) => p.incidentRatePct === null) &&
                    t("aFigure.noRate"),
                ]}
              />
            </Section>
          </WidgetShell>
        )
      }}
    </QueryGate>
  )
}
