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
  AskAiButton,
  CountPill,
  KpiGrid,
  SectionHeading,
  TableEmptyState,
  TableSkeleton,
  WidgetShell,
  type KpiCell,
} from "@miragon-ai/widget-shell/widgets"
import type { EngineLandscapeResult } from "@miragon-ai/client-analytics"
import { ANALYTICS_ENGINE_LANDSCAPE_DATA } from "../tool-names.js"
import { QueryGate } from "./query-gate.js"
import { useT, type T } from "../messages/use-t.js"

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
      value: totals.engineCount,
      trend: silent > 0 ? t("aLandscape.kpiEnginesSilent", { count: silent }) : undefined,
      trendTone: silent > 0 ? "critical" : undefined,
    },
    {
      label: t("aLandscape.kpiProcesses"),
      value: totals.processKeyCount,
      trend: t("aLandscape.kpiProcessesShared", { count: totals.sharedProcessKeyCount }),
    },
    { label: t("aLandscape.kpiRunning"), value: totals.runningInstances.toLocaleString() },
    {
      label: t("aLandscape.kpiIncidents"),
      value: totals.openIncidents,
      tone: totals.openIncidents > 0 ? "critical" : undefined,
    },
  ]
  return (
    <>
      <SectionHeading title={t("aLandscape.heading")} hint={t("aLandscape.headingHint")} />
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
                  {e.runningInstances.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {e.openIncidents > 0 ? (
                    <CountPill tone="critical">{e.openIncidents}</CountPill>
                  ) : (
                    <span className="text-muted-foreground tabular-nums">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {e.failedJobs > 0 ? (
                    <CountPill tone="warning">{e.failedJobs}</CountPill>
                  ) : (
                    <span className="text-muted-foreground tabular-nums">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {e.executableJobs.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {e.suspendedJobs.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {e.jobsDueFuture.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {e.openExternalTasks.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {e.deployedDefinitionKeys}
                  {e.exclusiveDefinitionKeys > 0 && (
                    <span className="text-muted-foreground ml-1 text-xs">
                      {t("aLandscape.exclusiveSuffix", { count: e.exclusiveDefinitionKeys })}
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
                      {t("aLandscape.sharedBadge", { count: p.engineIds.length })}
                    </Badge>
                  )}
                </TableCell>
                {engineIds.map((id) => {
                  const deployed = p.engineIds.includes(id)
                  return (
                    <TableCell key={id} className="text-right tabular-nums">
                      {deployed ? (
                        (p.runningByEngine[id] ?? 0).toLocaleString()
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
                    <CountPill tone="critical">{p.openIncidentsTotal}</CountPill>
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

/** The one valid engine-vs-engine handoff: same process, two engines. */
function CompareAction({ processKey, on, t }: { processKey: string; on: string[]; t: T }) {
  const [a, b] = on
  const more =
    on.length > 2
      ? ` It also runs on ${on.slice(2).join(", ")} — compare those pairs afterwards.`
      : ""
  return (
    <AskAiButton
      variant="icon"
      title={t("aLandscape.compareLabel", { key: processKey })}
      label={t("aLandscape.compareLabel", { key: processKey })}
      prompt={`Compare process definition "${processKey}" between the engines ${a} and ${b} over the last 14 days. Call analytics_show_engine_compare({processDefinitionKey: "${processKey}", engineA: "${a}", engineB: "${b}", windowDays: 14}) to render the side-by-side KPIs, then interpret the deltas (failure rate, incident rate, avg/p95 duration). Because the process is held fixed, a difference here really is attributable to the engine or its environment rather than to a different workload — say which engine runs it better, whether the gap is significant (watch the 'suppressed' low-sample flag), and the single recommended action.${more} Recommend only — do not change anything.`}
    />
  )
}
