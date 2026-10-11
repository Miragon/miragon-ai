import { Alert, AlertDescription, Button } from "@miragon/mcp-toolkit-ui"
import {
  HandOffButton,
  DrillButton,
  Icon,
  KpiGrid,
  RowCard,
  StatusBadge,
  WidgetHeader,
  WidgetShell,
  formatNumber,
  formatTime,
  type ToneVariant,
} from "@miragon-ai/widget-shell/widgets"
import { RefreshCw } from "lucide-react"
import { HostModelContext } from "@miragon/mcp-toolkit-ui/app"
import type { EngineHealthCluster, EngineHealthData, EngineHealthStatus } from "../view-models.js"
import { useNav, type OnNavigate } from "./navigation.js"
import { CAMUNDA7_ENGINE_HEALTH_DATA } from "../tool-names.js"
import { useViewData } from "./use-view-data.js"
import { remediationHandOff, UNKNOWN_KEY as UNKNOWN } from "./remediation.js"
import { useHandOff, type HandOff, type ViewContext } from "./lib/hand-off.js"
import { formatCount, formatCountAtLeast } from "./lib/format-count.js"
import { healthVerdictLine } from "./lib/health-verdict.js"
import { useT } from "../messages/use-t.js"

const STATUS: Record<EngineHealthStatus, { tone: ToneVariant; labelKey: string }> = {
  ok: { tone: "success", labelKey: "engineHealth.statusStable" },
  degraded: { tone: "warning", labelKey: "engineHealth.statusDegraded" },
  critical: { tone: "danger", labelKey: "engineHealth.statusCritical" },
}

/** The activity ids of the incident clusters, most affected first. */
function clusterActivities(data: EngineHealthData): string[] {
  return data.clusters.map((c) => c.activityId)
}

/**
 * Model context so the agent always knows what the operator is looking at —
 * the verdict, the headline numbers, and the dominant cluster — without the
 * operator having to restate it. This is the grounding half of the "ask the AI"
 * loop: when they click a handoff button, the agent already has the picture.
 */
export function describeHealth(data: EngineHealthData, engine?: string): ViewContext {
  const { summary, clusters, status } = data
  const top = clusters[0]
  return {
    summary: "The operator is viewing the engine health overview of one engine.",
    ids: { engine: engine ?? data.engineId },
    facts: {
      verdict: status,
      openIncidents: summary.totalIncidents,
      lastHour: summary.lastHourIncidents,
      last24h: summary.last24hIncidents,
      affectedActivities: summary.affectedActivities,
      affectedDefinitions: summary.affectedDefinitions,
      runningInstances: summary.runningInstances,
      started24h: summary.started24h,
      completed24h: summary.completed24h,
      topClusterActivity: top?.activityId,
      topClusterType: top?.incidentType,
      // A capped scan vouches only for the cluster's scanned share (#335).
      topClusterIncidents: top?.incidentCount ?? undefined,
      topClusterIncidentsAtLeast:
        top?.incidentCount === null ? top.scannedIncidentCount : undefined,
    },
    tools: [
      "analytics_engine_health",
      "analytics_show_failure_dashboard",
      "camunda7_list_incidents",
      "camunda7_show_cluster_detail",
    ],
  }
}

/** Hand the whole verdict to the agent: assess + name the first concrete action. */
export function triageHandOff(data: EngineHealthData, engine?: string): HandOff {
  const { summary } = data
  return {
    intent: "askAi.health.triage",
    ids: { engine: engine ?? data.engineId },
    facts: {
      openIncidents: summary.totalIncidents,
      lastHour: summary.lastHourIncidents,
      last24h: summary.last24hIncidents,
      affectedActivities: summary.affectedActivities,
      affectedDefinitions: summary.affectedDefinitions,
      runningInstances: summary.runningInstances,
      clusterActivities: clusterActivities(data),
    },
    tools: [
      "analytics_engine_health",
      "analytics_show_failure_dashboard",
      "camunda7_list_incidents",
      "camunda7_query_historic_incidents",
    ],
  }
}

/**
 * Diagnose handoff for the error state: the engine being unreachable is itself
 * an incident the operator can't assess alone — hand it to the agent instead of
 * leaving them with a bare red box. The error text is the engine's (or the
 * network's) — quoted, never inlined.
 */
export function diagnoseHandOff(engine: string | undefined, message: string): HandOff {
  return {
    intent: "askAi.health.diagnoseUnreachable",
    ids: { engine, maxResults: 1 },
    untrusted: [{ label: "error", text: message }],
    tools: ["camunda7_list_engines", "camunda7_list_process_definitions"],
  }
}

/** One cross-process incident cluster: deterministic facts + two handoffs (drill / ask). */
function ClusterRow({
  cluster,
  engine,
  go,
}: {
  cluster: EngineHealthCluster
  engine?: string
  go: OnNavigate
}) {
  const t = useT()
  const { ask, surface } = useHandOff()
  const { handOff, canFix } = remediationHandOff(cluster, engine, surface)
  const primaryKey = cluster.processDefinitionKeys.find((k) => k !== UNKNOWN)
  // Drill keeps the cluster scope: activity + type + message signature travel
  // into the cluster-detail view (instead of falling back to a per-process or
  // global incident list that loses the root-cause filter).
  const drill = () =>
    go({
      type: "cluster-detail",
      activityId: cluster.activityId,
      incidentType: cluster.incidentType,
      messageSignature: cluster.messageSignature,
    })

  const scope =
    cluster.processDefinitionKeys.length > 1
      ? t("engineHealth.scopeProcesses", {
          count: formatNumber(cluster.processDefinitionKeys.length),
        })
      : (primaryKey ?? UNKNOWN)

  return (
    <RowCard
      title={
        <>
          <span className="truncate font-mono">{cluster.activityId}</span>
          <StatusBadge tone="danger">{cluster.incidentType}</StatusBadge>
        </>
      }
      subtitle={
        <>
          {t("engineHealth.clusterAffected", {
            count: formatCountAtLeast(cluster.incidentCount, cluster.scannedIncidentCount),
          })}
          {cluster.last24hCount !== null && cluster.last24hCount > 0
            ? ` · ${t("engineHealth.clusterNew24h", { count: formatNumber(cluster.last24hCount) })}`
            : ""}{" "}
          · {scope}
        </>
      }
      actions={
        <>
          <DrillButton
            onDrill={drill}
            ariaLabel={t("engineHealth.clusterViewAria", { activity: cluster.activityId })}
          >
            {t("engineHealth.clusterOpen")}
          </DrillButton>
          <HandOffButton action={canFix ? "planFix" : "explainError"} prompt={ask(handOff)} />
        </>
      }
    />
  )
}

/** Error / loading / empty rendering for the missing-data case. */
function HealthUnavailable({
  engine,
  loading,
  error,
  onRetry,
}: {
  engine?: string
  loading: boolean
  error: Error | null
  onRetry: () => void
}) {
  const t = useT()
  const { ask } = useHandOff()
  if (error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="destructive">
          <AlertDescription>
            {t("engineHealth.unavailable", { message: error.message })}
          </AlertDescription>
        </Alert>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t("viewState.retry")}
          </Button>
          <HandOffButton action="findCause" prompt={ask(diagnoseHandOff(engine, error.message))} />
        </div>
      </div>
    )
  }
  return (
    <div className="text-muted-foreground p-2 text-sm">
      {loading ? t("engineHealth.loading") : t("engineHealth.noData")}
    </div>
  )
}

function HealthKpis({
  summary,
  status,
  go,
}: {
  summary: EngineHealthData["summary"]
  status: (typeof STATUS)[EngineHealthStatus]
  go: OnNavigate
}) {
  const t = useT()
  return (
    <KpiGrid
      boxed
      header={{ label: t("engineHealth.kpiHealth"), badge: t(status.labelKey) }}
      cells={[
        {
          label: t("engineHealth.kpiRunningInstances"),
          value: formatNumber(summary.runningInstances),
          // The engine-wide instances list — NOT the definitions list: the
          // KPI counts instances, so the drill must land on instances.
          onClick: () => go({ type: "process-instances" }),
          ariaLabel: t("engineHealth.kpiRunningInstancesAria"),
        },
        {
          label: t("engineHealth.kpiOpenIncidents"),
          // The derivative beats the absolute during an active incident:
          // "9 in the last hour" = burning now; fall back to the 24h count.
          value: formatNumber(summary.totalIncidents),
          fraction:
            summary.lastHourIncidents > 0
              ? ` ${t("engineHealth.kpiInLastHour", { count: formatNumber(summary.lastHourIncidents) })}`
              : summary.last24hIncidents > 0
                ? ` ${t("engineHealth.kpiIn24h", { count: formatNumber(summary.last24hIncidents) })}`
                : undefined,
          tone: summary.totalIncidents > 0 ? status.tone : undefined,
          onClick: () => go({ type: "incidents" }),
          ariaLabel: t("engineHealth.kpiOpenIncidentsAria"),
        },
        {
          label: t("engineHealth.kpiAffectedActivities"),
          // null: the incident scan was capped — "—", never a guessed count.
          value: formatCount(summary.affectedActivities),
          tone: (summary.affectedActivities ?? 0) > 0 ? "warning" : undefined,
        },
        {
          label: t("engineHealth.kpiAffectedProcesses"),
          value: formatNumber(summary.affectedDefinitions),
          fraction: ` /${formatNumber(summary.totalDefinitions)}`,
          tone: summary.affectedDefinitions > 0 ? "danger" : undefined,
        },
      ]}
    />
  )
}

/* Throughput makes the healthy state earn the screen: even with zero
   incidents the operator sees the engine actually moving work. Hidden
   when the history API is unavailable (counts degrade to null). */
function Throughput24h({ summary }: { summary: EngineHealthData["summary"] }) {
  const t = useT()
  if (summary.started24h === null && summary.completed24h === null) return null
  return (
    <p className="text-muted-foreground text-xs">
      {t("engineHealth.throughput24h")}{" "}
      {summary.started24h !== null
        ? t("engineHealth.throughputStarted", { count: formatNumber(summary.started24h) })
        : ""}
      {summary.started24h !== null && summary.completed24h !== null ? " · " : ""}
      {summary.completed24h !== null
        ? t("engineHealth.throughputCompleted", { count: formatNumber(summary.completed24h) })
        : ""}
    </p>
  )
}

function ClustersSection({
  clusters,
  engine,
  engineId,
  go,
}: {
  clusters: EngineHealthCluster[]
  engine?: string
  engineId: string
  go: OnNavigate
}) {
  const t = useT()
  if (clusters.length === 0) return null
  return (
    <section aria-label={t("engineHealth.clustersAria")} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{t("engineHealth.clustersHeading")}</h3>
      {clusters.map((cluster) => (
        // Fall back to the engine the data was fetched against (standalone
        // renders pass no `engine` prop) so the remediation prompt never
        // inlines a placeholder as a tool-call engine id.
        <ClusterRow key={cluster.id} cluster={cluster} engine={engine ?? engineId} go={go} />
      ))}
    </section>
  )
}

/**
 * Shell-less AI-first engine overview. One component, two modes (like the cockpit
 * widgets): standalone the agent's data arrives via `data`; inside the cockpit
 * only `engine` is passed and the view self-fetches its deterministic verdict
 * feed. The verdict + KPIs + incident clusters are deterministic; every element
 * is a launchpad — `go()` drills (client-side in the cockpit, a host follow-up
 * standalone), `HandOffButton` hands the judgment to the agent.
 */
export function EngineHealthView({
  data: initialData = null,
  engine,
}: {
  data?: EngineHealthData | null
  engine?: string
}) {
  const t = useT()
  const go = useNav()
  const { ask, context } = useHandOff()
  // Standalone the handed-in verdict SEEDS the feed query, scoped to the
  // engine it was read from — so the manual refresh (and a write's refetch)
  // re-reads the same engine in both modes, never the caller's default.
  // Always ready: unlike the per-process widgets (whose feeds require an id),
  // the health feed's `engine` is optional — resolveEngine falls back to the
  // caller's saved default engine or the single configured engine. Gating on
  // `!!engine` would leave a composed render without props stuck on
  // "No data available" forever.
  const feedEngine = engine ?? initialData?.engineId
  const { data, loading, error, refreshError, refreshing, refetch } = useViewData<EngineHealthData>(
    initialData,
    ["camunda7:engine-health", feedEngine ?? null],
    CAMUNDA7_ENGINE_HEALTH_DATA,
    { engine: feedEngine },
    true,
  )

  if (!data) {
    return <HealthUnavailable engine={engine} loading={loading} error={error} onRetry={refetch} />
  }

  const status = STATUS[data.status]

  return (
    <>
      <HostModelContext content={context(describeHealth(data, engine))}>{null}</HostModelContext>
      <WidgetHeader
        title={t("engineHealth.title")}
        sub={<span>{healthVerdictLine(t, data)}</span>}
        actions={
          <HandOffButton
            action="assess"
            variant="primary"
            prompt={ask(triageHandOff(data, engine))}
          />
        }
      />

      {/* Ops trust: show how fresh the verdict is and let the operator re-pull
          it — during an active incident this is the screen they stare at. */}
      <div className="text-muted-foreground -mt-2 flex items-center gap-2 text-xs">
        <span>
          {t("engineHealth.asOf", { time: formatTime(data.fetchedAt, { seconds: false }) })}
        </span>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={refetch}
          disabled={refreshing}
          className="hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded font-medium outline-none focus-visible:ring-2 disabled:opacity-50"
        >
          <Icon icon={RefreshCw} dense />
          {refreshing ? t("engineHealth.refreshing") : t("engineHealth.refresh")}
        </button>
        {/* A failed re-pull keeps the last verdict — and says it is not current. */}
        {refreshError && !refreshing && (
          <span role="alert" className="text-danger-ink">
            {t("engineHealth.refreshFailed", { message: refreshError.message })}
          </span>
        )}
      </div>

      <HealthKpis summary={data.summary} status={status} go={go} />

      <Throughput24h summary={data.summary} />

      <ClustersSection clusters={data.clusters} engine={engine} engineId={data.engineId} go={go} />
    </>
  )
}

export function EngineHealthVerdict({
  data,
  engine,
}: {
  data: EngineHealthData | null
  engine?: string
}) {
  return (
    <WidgetShell>
      <EngineHealthView data={data} engine={engine} />
    </WidgetShell>
  )
}
