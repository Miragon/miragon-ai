import { useEffect, useRef, useState } from "react"
import { Alert, AlertDescription, parseToolResult, useCallTool } from "@miragon/mcp-toolkit-ui"
import {
  AskAiButton,
  DrillButton,
  KpiGrid,
  RowCard,
  StatusBadge,
  WidgetHeader,
  WidgetShell,
  formatTime,
  type ToneVariant,
} from "@miragon-ai/widget-shell/widgets"
import { ModelContext } from "mcp-use/react"
import type { EngineHealthCluster, EngineHealthData, EngineHealthStatus } from "../view-models.js"
import { useNav, type OnNavigate } from "./navigation.js"
import { CAMUNDA7_ENGINE_HEALTH_DATA } from "../tool-names.js"
import { useViewData } from "./use-view-data.js"
import { remediatePrompt, UNKNOWN_KEY as UNKNOWN } from "./remediation.js"
import { fenceUntrusted } from "./lib/untrusted.js"
import { useT } from "../messages/use-t.js"

const STATUS: Record<EngineHealthStatus, { tone: ToneVariant; glyph: string; labelKey: string }> = {
  ok: { tone: "success", glyph: "✓", labelKey: "engineHealth.statusStable" },
  degraded: { tone: "warning", glyph: "!", labelKey: "engineHealth.statusDegraded" },
  critical: { tone: "critical", glyph: "✕", labelKey: "engineHealth.statusCritical" },
}

/**
 * Model-context line so the agent always knows what the operator is looking at —
 * the verdict, the headline numbers, and the dominant cluster — without the
 * operator having to restate it. This is the grounding half of the "ask the AI"
 * loop: when they click a handoff button, the agent already has the picture.
 */
function describeHealth(data: EngineHealthData, engine?: string): string {
  const { summary, clusters, status } = data
  const top = clusters[0]
  const topLine = top
    ? ` Dominant cluster: activity "${top.activityId}" failing as ${top.incidentType} ` +
      `(${top.incidentCount} incidents across ${top.processDefinitionKeys.length} definition(s)).`
    : ""
  return (
    `The operator is viewing the engine health overview for engine ` +
    `"${engine ?? data.engineId}". Verdict: ${status}. ${summary.totalIncidents} open ` +
    `incidents (${summary.lastHourIncidents} in the last hour, ` +
    `${summary.last24hIncidents} in the last 24h) across ` +
    `${summary.affectedActivities} activities and ${summary.affectedDefinitions} process ` +
    `definitions; ${summary.runningInstances} running instances` +
    (summary.started24h !== null
      ? `, throughput 24h: ${summary.started24h} started / ${summary.completed24h ?? "?"} completed`
      : "") +
    `.${topLine} ` +
    `Use analytics_engine_health and analytics_show_failure_dashboard for the live ops ` +
    `snapshot, camunda7_list_incidents to drill into a cluster.`
  )
}

/** Hand the whole verdict to the agent: assess + name the first concrete action. */
function triagePrompt(data: EngineHealthData, engine?: string): string {
  const { summary, clusters } = data
  const e = engine ?? data.engineId
  const clusterLines = clusters
    .map(
      (c) =>
        `- activity "${c.activityId}" / ${c.incidentType}: ${c.incidentCount} incidents` +
        (c.processDefinitionKeys[0] && c.processDefinitionKeys[0] !== UNKNOWN
          ? ` (process ${c.processDefinitionKeys.join(", ")})`
          : ""),
    )
    .join("\n")
  return (
    `Assess the operational health of CIB Seven / Camunda 7 engine "${e}" and tell me what ` +
    `to do first, in plain language for a distribution-center support operator (no Camunda ` +
    `jargon). Current state: ${summary.totalIncidents} open incidents ` +
    `(${summary.lastHourIncidents} new in the last hour, ${summary.last24hIncidents} in 24h) ` +
    `across ${summary.affectedActivities} activities ` +
    `and ${summary.affectedDefinitions} process definitions, ${summary.runningInstances} ` +
    `running instances. Top incident clusters:\n${clusterLines || "- none"}\n\n` +
    `Call analytics_engine_health (engine: ${e}) and analytics_show_failure_dashboard ` +
    `(engine: ${e}) for the live snapshot. Then: rank the clusters by impact, name the single ` +
    `most urgent problem in business terms, give the most likely root cause, and recommend the ` +
    `first concrete remediation step (batch retry, variable fix, migration, or escalation). Do ` +
    `not execute any mutating change without my confirmation.`
  )
}

/**
 * Diagnose handoff for the error state: the engine being unreachable is itself
 * an incident the operator can't assess alone — hand it to the agent instead of
 * leaving them with a bare red box.
 */
function diagnosePrompt(engine: string | undefined, message: string): string {
  const e = engine ? `engine "${engine}"` : "the configured engine"
  return (
    `The engine health check for ${e} failed with ${fenceUntrusted(message)}. Diagnose why the ` +
    `CIB Seven / Camunda 7 engine is not reachable, in plain language for a support ` +
    `operator. Start with camunda7_engine (action "list") to see the configured engines ` +
    `and their base URLs, then try a cheap read like camunda7_list_process_definitions(` +
    `{ maxResults: 1${engine ? `, engine: "${engine}"` : ""} }) to confirm whether the ` +
    `engine answers at all. Distinguish: engine down / wrong base URL / authentication ` +
    `failure / network issue. State the most likely cause and the concrete next step. ` +
    `Do not change anything.`
  )
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
      ? t("engineHealth.scopeProcesses", { count: cluster.processDefinitionKeys.length })
      : (primaryKey ?? UNKNOWN)

  return (
    <RowCard
      title={
        <>
          <span className="truncate font-mono">{cluster.activityId}</span>
          <StatusBadge tone="critical">{cluster.incidentType}</StatusBadge>
        </>
      }
      subtitle={
        <>
          {t("engineHealth.clusterAffected", { count: cluster.incidentCount })}
          {cluster.last24hCount > 0
            ? ` · ${t("engineHealth.clusterNew24h", { count: cluster.last24hCount })}`
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
          <AskAiButton
            variant="subtle"
            label={t("engineHealth.clusterFix")}
            prompt={remediatePrompt(cluster, engine)}
          />
        </>
      }
    />
  )
}

/**
 * Shell-less AI-first engine overview. One component, two modes (like the cockpit
 * widgets): standalone the agent's data arrives via `data`; inside the cockpit
 * only `engine` is passed and the view self-fetches its deterministic verdict
 * feed. The verdict + KPIs + incident clusters are deterministic; every element
 * is a launchpad — `go()` drills (client-side in the cockpit, a host follow-up
 * standalone), `AskAiButton` hands the judgment to the agent.
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
  const callTool = useCallTool()
  // Always ready: unlike the per-process widgets (whose feeds require an id),
  // the health feed's `engine` is optional — resolveEngine falls back to the
  // sticky session selection or the single configured engine. Gating on
  // `!!engine` would leave a composed render without props stuck on
  // "No data available" forever.
  const {
    data: fetched,
    loading,
    error,
  } = useViewData<EngineHealthData>(
    initialData,
    ["camunda7:engine-health", engine ?? null],
    CAMUNDA7_ENGINE_HEALTH_DATA,
    { engine },
    true,
  )

  // Manual refresh that works in BOTH modes: standalone the initial data is a
  // conversation snapshot (the self-fetch query is disabled), so a direct
  // re-pull of the feed replaces it locally. Reset when the engine changes.
  const [live, setLive] = useState<EngineHealthData | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // Request generation: an engine switch (or a newer refresh) invalidates every
  // in-flight refresh, so a slow response for engine A can never setLive() A's
  // snapshot while the view already shows engine B.
  const refreshGen = useRef(0)
  useEffect(() => {
    refreshGen.current++
    setLive(null)
    setRefreshing(false)
  }, [engine])
  const data = live ?? fetched

  async function refresh() {
    if (!callTool) return
    const gen = ++refreshGen.current
    setRefreshing(true)
    try {
      const result = await callTool(CAMUNDA7_ENGINE_HEALTH_DATA, {
        engine: engine ?? data?.engineId,
      })
      if (gen === refreshGen.current) setLive(parseToolResult<EngineHealthData>(result))
    } catch {
      // Keep the last snapshot on a failed refresh; the next attempt can retry.
    } finally {
      if (gen === refreshGen.current) setRefreshing(false)
    }
  }

  if (!data) {
    if (error) {
      return (
        <div className="flex flex-col items-start gap-3">
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
          <AskAiButton variant="primary" prompt={diagnosePrompt(engine, error.message)} />
        </div>
      )
    }
    return (
      <div className="text-muted-foreground p-2 text-sm">
        {loading ? t("engineHealth.loading") : t("engineHealth.noData")}
      </div>
    )
  }

  const status = STATUS[data.status]
  const { summary, clusters } = data

  return (
    <>
      <ModelContext content={describeHealth(data, engine)} />
      <WidgetHeader
        icon={status.glyph}
        iconTone={status.tone}
        title={t("engineHealth.title")}
        sub={<span>{data.headline}</span>}
        actions={
          <AskAiButton
            variant="primary"
            label={t("engineHealth.whatShouldIDo")}
            prompt={triagePrompt(data, engine)}
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
          onClick={() => void refresh()}
          disabled={refreshing}
          className="hover:text-foreground focus-visible:ring-ring rounded font-medium outline-none focus-visible:ring-2 disabled:opacity-50"
        >
          {refreshing ? t("engineHealth.refreshing") : t("engineHealth.refresh")}
        </button>
      </div>

      <KpiGrid
        boxed
        header={{ label: t("engineHealth.kpiHealth"), badge: t(status.labelKey) }}
        cells={[
          {
            label: t("engineHealth.kpiRunningInstances"),
            value: summary.runningInstances,
            onClick: () => go({ type: "process-list" }),
            ariaLabel: t("engineHealth.kpiRunningInstancesAria"),
          },
          {
            label: t("engineHealth.kpiOpenIncidents"),
            // The derivative beats the absolute during an active incident:
            // "9 in the last hour" = burning now; fall back to the 24h count.
            value: summary.totalIncidents,
            fraction:
              summary.lastHourIncidents > 0
                ? ` ${t("engineHealth.kpiInLastHour", { count: summary.lastHourIncidents })}`
                : summary.last24hIncidents > 0
                  ? ` ${t("engineHealth.kpiIn24h", { count: summary.last24hIncidents })}`
                  : undefined,
            tone: summary.totalIncidents > 0 ? status.tone : undefined,
            onClick: () => go({ type: "incidents" }),
            ariaLabel: t("engineHealth.kpiOpenIncidentsAria"),
          },
          {
            label: t("engineHealth.kpiAffectedActivities"),
            value: summary.affectedActivities,
            tone: summary.affectedActivities > 0 ? "warning" : undefined,
          },
          {
            label: t("engineHealth.kpiAffectedProcesses"),
            value: summary.affectedDefinitions,
            fraction: ` /${summary.totalDefinitions}`,
            tone: summary.affectedDefinitions > 0 ? "critical" : undefined,
          },
        ]}
      />

      {/* Throughput makes the healthy state earn the screen: even with zero
          incidents the operator sees the engine actually moving work. Hidden
          when the history API is unavailable (counts degrade to null). */}
      {(summary.started24h !== null || summary.completed24h !== null) && (
        <p className="text-muted-foreground text-xs">
          {t("engineHealth.throughput24h")}{" "}
          {summary.started24h !== null
            ? t("engineHealth.throughputStarted", { count: summary.started24h.toLocaleString() })
            : ""}
          {summary.started24h !== null && summary.completed24h !== null ? " · " : ""}
          {summary.completed24h !== null
            ? t("engineHealth.throughputCompleted", {
                count: summary.completed24h.toLocaleString(),
              })
            : ""}
        </p>
      )}

      {clusters.length > 0 && (
        <section aria-label={t("engineHealth.clustersAria")} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t("engineHealth.clustersHeading")}</h3>
          {clusters.map((cluster) => (
            // Fall back to the engine the data was fetched against (standalone
            // renders pass no `engine` prop) so the remediation prompt never
            // inlines a placeholder as a tool-call engine id.
            <ClusterRow
              key={cluster.id}
              cluster={cluster}
              engine={engine ?? data.engineId}
              go={go}
            />
          ))}
        </section>
      )}
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
