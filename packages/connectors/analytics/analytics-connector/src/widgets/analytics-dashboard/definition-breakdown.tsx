import { TONE_DOT, cn } from "@miragon/mcp-toolkit-ui"
import {
  ListTable,
  Section,
  TableEmptyState,
  TableSkeleton,
  Td,
  WidgetShell,
  formatDuration,
  formatNumber,
  type ListTableColumn,
} from "@miragon-ai/widget-shell/widgets"
import { useDashboardSelfFetch, type DashboardScopeProps, type DashboardView } from "./lib.js"
import { QueryGate } from "../query-gate.js"
import { useT, type T } from "../../messages/use-t.js"
import { processNameOf } from "../../bpmn-names.js"
import { NamedId } from "../names.js"

/**
 * The figures side by side (U17): one row per process, the counts in
 * right-aligned tabular columns, so the processes compare at a glance. The
 * average duration gives way below 640 px.
 */
function columns(t: T): ListTableColumn[] {
  return [
    { label: t("aDefBreakdown.colProcess") },
    { label: t("aDefBreakdown.colStarted"), align: "right" },
    { label: t("aDefBreakdown.colCompleted"), align: "right" },
    { label: t("aDefBreakdown.colRunningNow"), align: "right" },
    { label: t("aDefBreakdown.colIncidents"), align: "right" },
    { label: t("aDefBreakdown.colAvgDuration"), align: "right", hideBelow: "sm" },
  ]
}

/**
 * A count of incidents created in the period: the number neutral, a danger
 * dot next to it when there is any (CI §3.3: the state is the dot, never a
 * coloured digit). The other counts carry no state and no dot.
 */
function IncidentCount({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center justify-end gap-1.5 tabular-nums">
      {count > 0 && (
        <span
          aria-hidden="true"
          data-tone="danger"
          className={cn("size-2 shrink-0 rounded-full", TONE_DOT.danger)}
        />
      )}
      {formatNumber(count)}
    </span>
  )
}

export function ProcessDefinitionBreakdown({
  data: initialData,
  processDefinitionKey,
  period,
  engine,
}: { data: DashboardView | null } & DashboardScopeProps) {
  const t = useT()
  const fallbackQuery = useDashboardSelfFetch(initialData, { processDefinitionKey, period, engine })

  return (
    <QueryGate initialData={initialData} query={fallbackQuery} skeleton={<TableSkeleton />}>
      {(data) =>
        data.definitionBreakdown.length === 0 ? (
          <WidgetShell>
            <TableEmptyState description={t("aDefBreakdown.emptyHint")}>
              {t("aDefBreakdown.emptyState")}
            </TableEmptyState>
          </WidgetShell>
        ) : (
          <WidgetShell>
            <Section
              title={t("aDefBreakdown.heading")}
              count={data.definitionBreakdown.length}
              defaultOpen
            >
              <ListTable ariaLabel={t("aDefBreakdown.tableLabel")} columns={columns(t)}>
                {data.definitionBreakdown.map((def) => (
                  <tr key={def.processDefinitionKey}>
                    <Td>
                      <NamedId
                        name={processNameOf(data.names, def.processDefinitionKey)}
                        id={def.processDefinitionKey}
                      />
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {formatNumber(def.totalInstances)}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {formatNumber(def.completed)}
                    </Td>
                    {/* Not reported (no engine in scope sends its gauges): "—", never 0. */}
                    <Td align="right" className="tabular-nums">
                      {formatNumber(def.runningNow)}
                    </Td>
                    <Td align="right">
                      <IncidentCount count={def.incidentsCreated} />
                    </Td>
                    <Td align="right" className="whitespace-nowrap tabular-nums">
                      {formatDuration(def.avgDurationMs)}
                    </Td>
                  </tr>
                ))}
              </ListTable>
            </Section>
          </WidgetShell>
        )
      }
    </QueryGate>
  )
}
