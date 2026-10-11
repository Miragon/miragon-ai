import {
  Alert,
  AlertDescription,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToolQuery,
} from "@miragon/mcp-toolkit-ui"
import {
  HandOffButton,
  CountPill,
  KpiGrid,
  SectionHeading,
  TableEmptyState,
  TableSkeleton,
  ViewMeta,
  WidgetShell,
  formatNumber,
  type KpiCell,
} from "@miragon-ai/widget-shell/widgets"
import type { EngineLandscapeResult } from "@miragon-ai/analytics-client"
import { ANALYTICS_ENGINE_LANDSCAPE_DATA } from "../tool-names.js"
import { QueryGate } from "./query-gate.js"
import { useT, type T } from "../messages/use-t.js"
import { useHandOff, type HandOff } from "./hand-off.js"

export type EngineLandscapeData = EngineLandscapeResult | null

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
  const query = useToolQuery<EngineLandscapeResult>(
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

function LandscapeSummary({ data, t }: { data: EngineLandscapeResult; t: T }) {
  const { totals } = data
  const silent = totals.engineCount - totals.reportingEngineCount
  const cells: KpiCell[] = [
    {
      label: t("aLandscape.kpiEngines"),
      value: formatNumber(totals.engineCount),
      trend:
        silent > 0 ? t("aLandscape.kpiEnginesSilent", { count: formatNumber(silent) }) : undefined,
      trendTone: silent > 0 ? "danger" : undefined,
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
      tone: totals.openIncidents > 0 ? "danger" : undefined,
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
 * One row per engine. Split into two column groups on purpose: the load counts
 * are absolute (comparable only as "where the work sits"), while the backlog
 * gauges carry no process label and therefore genuinely compare across engines.
 * That second group is shown in FULL (executable, suspended, due-later,
 * external tasks) — it is the only mix-independent evidence this view offers,
 * and the fleet prompt tells the model to judge engines on exactly it.
 */
function EngineTable({ data, t }: { data: EngineLandscapeResult; t: T }) {
  if (data.engines.length === 0) {
    return <TableEmptyState>{t("aLandscape.emptyEngines")}</TableEmptyState>
  }
  return (
    <section>
      <SectionHeading title={t("aLandscape.engines.title")} hint={t("aLandscape.engines.hint")} />
      <div className="overflow-x-auto rounded-lg border">
        <Table aria-label={t("aLandscape.engines.tableLabel")}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("aLandscape.colEngine")}</TableHead>
              <TableHead scope="col" className="text-right">
                {t("aLandscape.colRunning")}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t("aLandscape.colIncidents")}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t("aLandscape.colFailedJobs")}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t("aLandscape.colExecutable")}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t("aLandscape.colSuspended")}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t("aLandscape.colDueFuture")}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t("aLandscape.colExternalTasks")}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t("aLandscape.colProcesses")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.engines.map((e) => (
              <TableRow key={e.engineId}>
                <TableCell className="font-mono text-sm font-medium">
                  {e.engineId}
                  {!e.reporting && (
                    <Badge variant="destructive" className="ml-2">
                      {t("aLandscape.noMetrics")}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(e.runningInstances)}
                </TableCell>
                <TableCell className="text-right">
                  {e.openIncidents > 0 ? (
                    <CountPill tone="danger">{formatNumber(e.openIncidents)}</CountPill>
                  ) : (
                    <span className="text-muted-foreground tabular-nums">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {e.failedJobs > 0 ? (
                    <CountPill tone="warning">{formatNumber(e.failedJobs)}</CountPill>
                  ) : (
                    <span className="text-muted-foreground tabular-nums">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(e.executableJobs)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(e.suspendedJobs)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(e.jobsDueFuture)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(e.openExternalTasks)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(e.deployedDefinitionKeys)}
                  {e.exclusiveDefinitionKeys > 0 && (
                    <span className="text-muted-foreground ml-1 text-xs">
                      {t("aLandscape.exclusiveSuffix", {
                        count: formatNumber(e.exclusiveDefinitionKeys),
                      })}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

/**
 * The process × engine inventory. Shared definitions lead the table and are the
 * only rows offering the KPI comparison — everywhere else the two engines have
 * no common workload to compare.
 */
function ProcessMatrix({ data, t }: { data: EngineLandscapeResult; t: T }) {
  const engineIds = data.engines.map((e) => e.engineId)
  if (data.processes.length === 0) {
    return <TableEmptyState>{t("aLandscape.emptyProcesses")}</TableEmptyState>
  }
  return (
    <section>
      <SectionHeading title={t("aLandscape.matrix.title")} hint={t("aLandscape.matrix.hint")} />
      <Alert className="mb-3">
        <AlertDescription>{t("aLandscape.mixNote")}</AlertDescription>
      </Alert>
      <div className="overflow-x-auto rounded-lg border">
        <Table aria-label={t("aLandscape.matrix.tableLabel")}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("aLandscape.colProcess")}</TableHead>
              {engineIds.map((id) => (
                <TableHead key={id} scope="col" className="text-right font-mono">
                  {id}
                </TableHead>
              ))}
              <TableHead scope="col" className="text-right">
                {t("aLandscape.colIncidents")}
              </TableHead>
              <TableHead scope="col" className="text-right">
                <span className="sr-only">{t("aLandscape.colCompare")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.processes.map((p) => (
              <TableRow key={p.processDefinitionKey}>
                <TableCell className="font-mono text-sm font-medium">
                  {p.processDefinitionKey}
                  {p.shared && (
                    <Badge variant="secondary" className="ml-2">
                      {t("aLandscape.sharedBadge", { count: formatNumber(p.engineIds.length) })}
                    </Badge>
                  )}
                </TableCell>
                {engineIds.map((id) => {
                  const deployed = p.engineIds.includes(id)
                  return (
                    <TableCell key={id} className="text-right tabular-nums">
                      {deployed ? (
                        formatNumber(p.runningByEngine[id] ?? 0)
                      ) : (
                        <span className="text-muted-foreground" title={t("aLandscape.notDeployed")}>
                          —
                        </span>
                      )}
                    </TableCell>
                  )
                })}
                <TableCell className="text-right">
                  {p.openIncidentsTotal > 0 ? (
                    <CountPill tone="danger">{formatNumber(p.openIncidentsTotal)}</CountPill>
                  ) : (
                    <span className="text-muted-foreground tabular-nums">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {p.shared && (
                    <CompareAction processKey={p.processDefinitionKey} on={p.engineIds} t={t} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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
