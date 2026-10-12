import type { ReactNode } from "react"
import {
  Badge,
  CountPill,
  KpiGrid,
  SectionHeading,
  StatusBadge,
  useToolQuery,
  type KpiCell,
} from "@miragon/mcp-toolkit-ui"
import { Info } from "lucide-react"
import {
  HandOffButton,
  Icon,
  ListTable,
  TableEmptyState,
  TableSkeleton,
  Td,
  ViewMeta,
  WidgetShell,
  formatNumber,
  type ListTableColumn,
  type ListTableGroup,
} from "@miragon-ai/widget-shell/widgets"
import type { EngineLandscapeEngine, EngineLandscapeResult } from "@miragon-ai/analytics-client"
import { ANALYTICS_ENGINE_LANDSCAPE_DATA } from "../tool-names.js"
import { QueryGate } from "./query-gate.js"
import { useT, type T } from "../messages/use-t.js"
import { useHandOff, type HandOff } from "./hand-off.js"
import { processNameOf, type Named } from "../bpmn-names.js"
import { NamedId } from "./names.js"
import { Figure } from "./figure.js"

/** The landscape payload: the figures plus the process names behind the matrix's keys. */
export type EngineLandscapeView = Named<EngineLandscapeResult>
export type EngineLandscapeData = EngineLandscapeView | null

/** Engine ids from the layout cell props (`engine` may be a string or a list). */
function engineIdsFromProps(engine: string | string[] | undefined): string[] {
  if (typeof engine === "string") return engine.length > 0 ? [engine] : []
  if (Array.isArray(engine)) return engine.filter((id) => typeof id === "string" && id.length > 0)
  return []
}

/**
 * The cross-engine overview: what runs where, how much of it, and which engines
 * carry a backlog.
 *
 * Deliberately NOT an engine scoreboard. Two engines run different processes,
 * so a per-engine failure rate or average duration describes the process mix,
 * not the engine — the widget therefore shows absolute counts plus the
 * process-independent job backlog, and offers the KPI comparison only for the
 * definitions that actually run on more than one engine.
 *
 * "—" means one thing here: not measured (an engine that sends no metrics).
 * A process that is not deployed on an engine is an empty matrix cell.
 */
export function EngineLandscapeWidget({
  data: initialData,
  engine,
}: {
  data: EngineLandscapeData
  /** Engine ids to include; pass all configured ones to surface silent engines. */
  engine?: string | string[]
}) {
  const t = useT()
  const engineIds = engineIdsFromProps(engine)
  const query = useToolQuery<EngineLandscapeView>(
    // The engine scope belongs in the key: a subset view must not read the
    // full-fleet payload out of the cache.
    ["analytics:engine-landscape", engineIds.join(",")],
    ANALYTICS_ENGINE_LANDSCAPE_DATA,
    engineIds.length > 0 ? { engine: engineIds } : {},
    { enabled: !initialData },
  )

  return (
    <QueryGate initialData={initialData} query={query} skeleton={<TableSkeleton />}>
      {(data) => (
        <WidgetShell>
          <LandscapeSummary data={data} t={t} />
          <EngineTable data={data} t={t} />
          <ProcessMatrix data={data} t={t} />
        </WidgetShell>
      )}
    </QueryGate>
  )
}

function LandscapeSummary({ data, t }: { data: EngineLandscapeView; t: T }) {
  const { totals } = data
  const silent = totals.engineCount - totals.reportingEngineCount
  const cells: KpiCell[] = [
    {
      label: t("aLandscape.kpiEngines"),
      value: formatNumber(totals.engineCount),
      // An engine without metrics may be down: worth a look, not an error.
      trend:
        silent > 0 ? t("aLandscape.kpiEnginesSilent", { count: formatNumber(silent) }) : undefined,
      trendTone: silent > 0 ? "warning" : undefined,
    },
    {
      label: t("aLandscape.kpiProcesses"),
      value: formatNumber(totals.processKeyCount),
      trend: t("aLandscape.kpiProcessesShared", {
        count: formatNumber(totals.sharedProcessKeyCount),
      }),
    },
    { label: t("aLandscape.kpiRunning"), value: formatNumber(totals.runningInstances) },
    {
      label: t("aLandscape.kpiIncidents"),
      value: formatNumber(totals.openIncidents),
      tone: (totals.openIncidents ?? 0) > 0 ? "danger" : undefined,
    },
  ]
  return (
    <>
      <SectionHeading title={t("aLandscape.heading")} hint={t("aLandscape.headingHint")} />
      {/* A live snapshot: no period, the engines (and how many send no metrics) and when. */}
      <ViewMeta
        className="-mt-2 mb-3"
        engines={{ count: totals.engineCount, silent }}
        asOf={data.asOf}
      />
      <KpiGrid cells={cells} />
    </>
  )
}

/**
 * The per-engine table in its two column groups, headed as such (U17): the
 * load counts are absolute (comparable only as "where the work sits"), while
 * the backlog gauges carry no process label and therefore genuinely compare
 * across engines. The backlog is shown in FULL — it is the only
 * mix-independent evidence this view offers, and the fleet prompt tells the
 * model to judge engines on exactly it — so it never hides; only the
 * inventory column gives way below 768 px.
 */
function engineColumns(t: T): ListTableColumn[] {
  return [
    { label: t("aLandscape.colEngine") },
    { label: t("aLandscape.colRunning"), align: "right" },
    { label: t("aLandscape.colIncidents"), align: "right" },
    { label: t("aLandscape.colFailedJobs"), align: "right" },
    { label: t("aLandscape.colExecutable"), align: "right" },
    { label: t("aLandscape.colSuspended"), align: "right" },
    { label: t("aLandscape.colDueFuture"), align: "right" },
    { label: t("aLandscape.colExternalTasks"), align: "right" },
    { label: t("aLandscape.colProcesses"), align: "right", hideBelow: "md" },
  ]
}

function engineGroups(t: T): ListTableGroup[] {
  return [
    {},
    { label: t("aLandscape.groupLoad"), span: 3 },
    { label: t("aLandscape.groupBacklog"), span: 4 },
    {},
  ]
}

/** One count of an engine: the number, or "—" with its meaning for an engine without metrics. */
function CountCell({ value, t }: { value: number | null; t: T }) {
  return (
    <Td align="right" className="tabular-nums">
      <Figure value={value} why={t("aLandscape.unknown")} />
    </Td>
  )
}

/**
 * An engine's open incidents: the one state among its counts (decision f),
 * so it carries the danger edge the matrix below and the failure tables give
 * an open incident. The number itself stays in the foreground.
 */
function OpenIncidentsCell({ value, t }: { value: number | null; t: T }) {
  if (value === null || value === 0) return <CountCell value={value} t={t} />
  return (
    <Td align="right">
      <CountPill tone="danger">{formatNumber(value)}</CountPill>
    </Td>
  )
}

function EngineRow({ engine: e, t }: { engine: EngineLandscapeEngine; t: T }) {
  return (
    <tr>
      <Td>
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-medium">{e.engineId}</span>
          {!e.reporting && <StatusBadge tone="warning">{t("aLandscape.noMetrics")}</StatusBadge>}
        </span>
      </Td>
      <CountCell value={e.runningInstances} t={t} />
      <OpenIncidentsCell value={e.openIncidents} t={t} />
      <CountCell value={e.failedJobs} t={t} />
      <CountCell value={e.executableJobs} t={t} />
      <CountCell value={e.suspendedJobs} t={t} />
      <CountCell value={e.jobsDueFuture} t={t} />
      <CountCell value={e.openExternalTasks} t={t} />
      <Td align="right" className="tabular-nums">
        <Figure value={e.deployedDefinitionKeys} why={t("aLandscape.unknown")} />
        {(e.exclusiveDefinitionKeys ?? 0) > 0 && (
          <span className="text-muted-foreground text-small ml-1 whitespace-nowrap">
            {t("aLandscape.exclusiveSuffix", {
              count: formatNumber(e.exclusiveDefinitionKeys),
            })}
          </span>
        )}
      </Td>
    </tr>
  )
}

/** A quiet note under a table: what a sign in it means. */
function Legend({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-small mt-2">{children}</p>
}

function EngineTable({ data, t }: { data: EngineLandscapeView; t: T }) {
  if (data.engines.length === 0) {
    return <TableEmptyState>{t("aLandscape.emptyEngines")}</TableEmptyState>
  }
  const silent = data.engines.some((e) => !e.reporting)
  return (
    <section>
      <SectionHeading title={t("aLandscape.engines.title")} hint={t("aLandscape.engines.hint")} />
      <ListTable
        ariaLabel={t("aLandscape.engines.tableLabel")}
        columns={engineColumns(t)}
        groups={engineGroups(t)}
        // Eight figures side by side: the compact cell padding keeps every
        // backlog column in a 760 px inline view, in German too.
        className="[&_td]:px-3 [&_th]:px-3"
      >
        {data.engines.map((e) => (
          <EngineRow key={e.engineId} engine={e} t={t} />
        ))}
      </ListTable>
      {silent && (
        <Legend>
          <span className="text-foreground font-medium">{formatNumber(null)}</span>{" "}
          {t("aLandscape.legendUnknown")}
        </Legend>
      )}
    </section>
  )
}

/**
 * The process × engine inventory. Shared definitions lead the table and are the
 * only rows offering the KPI comparison — everywhere else the two engines have
 * no common workload to compare. Its columns are the engines that send
 * metrics: a silent engine has nothing to show here, the meta line counts it
 * and a note names it. The comparison is pinned at the right edge, so it
 * stays in reach however many engines there are.
 */
function ProcessMatrix({ data, t }: { data: EngineLandscapeView; t: T }) {
  if (data.processes.length === 0) {
    return <TableEmptyState>{t("aLandscape.emptyProcesses")}</TableEmptyState>
  }
  const engineIds = data.engines.filter((e) => e.reporting).map((e) => e.engineId)
  const silent = data.engines.filter((e) => !e.reporting).map((e) => e.engineId)
  const columns: ListTableColumn[] = [
    { label: t("aLandscape.colProcess") },
    ...engineIds.map((id): ListTableColumn => ({
      label: <span className="font-mono">{id}</span>,
      align: "right",
    })),
    { label: t("aLandscape.colIncidents"), align: "right" },
    {
      label: <span className="sr-only">{t("aLandscape.colCompare")}</span>,
      plain: true,
      sticky: true,
    },
  ]
  return (
    <section>
      <SectionHeading title={t("aLandscape.matrix.title")} hint={t("aLandscape.matrix.hint")} />
      <p className="text-muted-foreground text-small mb-3 flex items-start gap-2">
        <Icon icon={Info} dense className="mt-0.5" />
        <span>{t("aLandscape.mixNote")}</span>
      </p>
      <ListTable ariaLabel={t("aLandscape.matrix.tableLabel")} columns={columns}>
        {data.processes.map((p) => (
          <tr key={p.processDefinitionKey}>
            <Td>
              <span className="flex flex-wrap items-center gap-2">
                <NamedId
                  name={processNameOf(data.names, p.processDefinitionKey)}
                  id={p.processDefinitionKey}
                />
                {p.shared && (
                  <Badge variant="outline">
                    {t("aLandscape.sharedBadge", { count: formatNumber(p.engineIds.length) })}
                  </Badge>
                )}
              </span>
            </Td>
            {engineIds.map((id) => (
              <Td key={id} align="right" className="tabular-nums">
                {p.engineIds.includes(id) ? (
                  formatNumber(p.runningByEngine[id] ?? 0)
                ) : (
                  // Not deployed: an empty cell (the legend says so), never "—".
                  <span className="sr-only">{t("aLandscape.notDeployed")}</span>
                )}
              </Td>
            ))}
            <Td align="right">
              {p.openIncidentsTotal > 0 ? (
                <CountPill tone="danger">{formatNumber(p.openIncidentsTotal)}</CountPill>
              ) : (
                <span className="tabular-nums">{formatNumber(0)}</span>
              )}
            </Td>
            <Td align="right">
              {p.shared && (
                <CompareAction processKey={p.processDefinitionKey} on={p.engineIds} t={t} />
              )}
            </Td>
          </tr>
        ))}
      </ListTable>
      <Legend>{t("aLandscape.legendNotDeployed")}</Legend>
      {silent.length > 0 && (
        <Legend>{t("aLandscape.silentNote", { engines: silent.join(", ") })}</Legend>
      )}
    </section>
  )
}

/**
 * The one valid engine-vs-engine hand-off: same process, two engines (the
 * further engines it runs on are named so the model can pair them next).
 */
export function landscapeCompareHandOff(processKey: string, on: readonly string[]): HandOff {
  const [engineA, engineB, ...more] = on
  return {
    intent: "askAi.landscapeCompare",
    ids: { processDefinitionKey: processKey, engineA, engineB, windowDays: 14 },
    facts: { alsoRunsOn: more.length > 0 ? more : undefined },
    tools: ["analytics_show_engine_compare"],
  }
}

function CompareAction({ processKey, on, t }: { processKey: string; on: string[]; t: T }) {
  const { ask } = useHandOff()
  return (
    <HandOffButton
      action="compareEngines"
      variant="icon"
      title={t("aLandscape.compareLabel", { key: processKey })}
      prompt={ask(landscapeCompareHandOff(processKey, on))}
    />
  )
}
