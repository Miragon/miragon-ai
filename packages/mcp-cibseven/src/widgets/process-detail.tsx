import { useMemo, useState } from "react"
import { Alert, AlertDescription, useToolQuery } from "@miragon/mcp-toolkit-ui"

import type { ProcessDetailData } from "../view-models.js"

import {
  AskAiButton,
  BpmnHeatmap,
  DrillButton,
  HeatmapLegend,
  KpiGrid,
  OpenInCockpitLink,
  SectionHeading,
  StatusBadge,
  WidgetShell,
  type BpmnHeatmapData,
  type KpiCell,
  type ToneVariant,
} from "@miragon-ai/widget-shell/widgets"

import { CAMUNDA7_PROCESS_DETAIL_DATA } from "../tool-names.js"
import { BpmnDiagram, type BpmnHighlight } from "./bpmn-diagram.js"
import { useNav } from "./navigation.js"

type FlowMode = "live" | "frequency" | "duration"

/**
 * Lazily loads the execution heatmap (Prometheus metrics via the analytics
 * module's plain data feed) and paints it on the definition diagram. Mounted
 * only when the operator switches the "Process flow" toggle off "Live", so the
 * metrics query never runs on first paint. `mode` swaps frequency↔duration
 * without refetching (both come in one payload).
 */
function ProcessHeatmap({
  processDefinitionKey,
  mode,
}: {
  processDefinitionKey: string
  mode: "frequency" | "duration"
}) {
  const q = useToolQuery<BpmnHeatmapData>(
    ["camunda7:heatmap", processDefinitionKey],
    "analytics_bpmn_heatmap_data",
    { processDefinitionKey, period: "30d" },
  )
  if (q.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{q.error?.message ?? "Failed to load the heatmap."}</AlertDescription>
      </Alert>
    )
  }
  if (!q.data) {
    return <div className="text-muted-foreground p-6 text-sm">Loading heatmap…</div>
  }
  if (!q.data.bpmnXml) {
    return (
      <Alert>
        <AlertDescription>No diagram available for the heatmap.</AlertDescription>
      </Alert>
    )
  }
  const values = mode === "frequency" ? q.data.frequency : q.data.durationSec
  return <BpmnHeatmap bpmnXml={q.data.bpmnXml} nodeFrequencies={values} height={340} />
}

export type { ProcessDetailData }

/**
 * Shell-less process-definition detail. One component, two modes: rendered
 * standalone the agent's tool result is handed in via `data`; rendered inside the
 * cockpit only `processDefinitionKey`/`engine` are passed and the view self-fetches
 * (deduped under a shared query key). Navigation goes through {@link useNav} so the
 * cockpit routes client-side while the standalone widget drills in via the host.
 */
export function ProcessDetailView({
  data: initialData = null,
  processDefinitionKey,
  engine,
}: {
  data?: ProcessDetailData | null
  processDefinitionKey?: string
  engine?: string
}) {
  const go = useNav()
  const [flowMode, setFlowMode] = useState<FlowMode>("live")

  const query = useToolQuery<ProcessDetailData>(
    ["camunda7:process-detail", engine ?? null, processDefinitionKey ?? null],
    CAMUNDA7_PROCESS_DETAIL_DATA,
    { processDefinitionKey, engine },
    { enabled: !initialData && !!processDefinitionKey },
  )
  const data = initialData ?? query.data ?? null

  // Heatmap overlay: a blue running-token badge (top-right) on every active
  // activity, plus a red badge (top-left) for problems — incidents where they
  // exist, otherwise failed jobs (no retries yet). The two reds never collide
  // because an incident already implies its failed job.
  const highlights = useMemo<BpmnHighlight[]>(() => {
    const all = data?.activities ?? []
    const running = all.filter((a) => a.instances > 0)
    const incidents = all.filter((a) => a.incidentCount > 0)
    const failedOnly = all.filter((a) => a.failedJobs > 0 && a.incidentCount === 0)
    return [
      {
        kind: "instance-count",
        counts: running.map((a) => ({ activityId: a.activityId, count: a.instances })),
      },
      {
        kind: "incident",
        activityIds: incidents.map((a) => a.activityId),
        counts: incidents.map((a) => ({ activityId: a.activityId, count: a.incidentCount })),
      },
      {
        kind: "failed-jobs",
        counts: failedOnly.map((a) => ({ activityId: a.activityId, count: a.failedJobs })),
      },
    ]
  }, [data?.activities])

  if (!data) {
    if (query.isError) {
      return (
        <Alert variant="destructive">
          <AlertDescription>{query.error?.message ?? "Failed to load."}</AlertDescription>
        </Alert>
      )
    }
    if (!initialData && processDefinitionKey) {
      return <div className="text-muted-foreground p-6 text-sm">Loading…</div>
    }
    return (
      <Alert>
        <AlertDescription>No data available</AlertDescription>
      </Alert>
    )
  }

  const title = data.processDefinitionName ?? data.processDefinitionKey
  const headerTone: ToneVariant = data.openIncidents > 0 ? "critical" : "info"
  const cockpitUrl = data.cockpitUrl
  const totalActivityFraction =
    data.totalActivityCount !== null
      ? `${data.affectedActivityCount}/${data.totalActivityCount}`
      : `${data.affectedActivityCount}`

  const stats: KpiCell[] = [
    {
      label: "Open incidents",
      value: data.openIncidents,
      tone: data.openIncidents > 0 ? "critical" : undefined,
    },
    {
      label: "Activities affected",
      value: totalActivityFraction,
    },
    {
      label: "Running",
      value: data.runningInstances !== null ? data.runningInstances.toLocaleString() : "—",
      tone: data.runningInstances && data.runningInstances > 0 ? "success" : undefined,
      onClick: () =>
        go({ type: "process-instances", processDefinitionKey: data.processDefinitionKey }),
      ariaLabel: `View running instances of ${title}`,
    },
  ]
  if (data.failedJobs > 0) {
    stats.push({
      label: "Failed jobs",
      value: data.failedJobs,
      tone: "warning",
    })
  }

  // AI handoff prompts — fully self-contained (engine + concrete ids inlined) so
  // the chat follow-up needs no ambient context. The problem-activity lists are
  // baked in here from the in-scope `data.activities`.
  const engineId = data.engineId ?? engine ?? "default"
  const problemActivities = data.activities.filter((a) => a.incidentCount > 0 || a.failedJobs > 0)
  const problemActivityList =
    problemActivities
      .map(
        (a) =>
          `"${a.activityName ?? a.activityId} (${a.activityId}): ${a.incidentCount} incidents, ${a.failedJobs} failed jobs, ${a.instances} running"`,
      )
      .join(", ") || "(none reported)"
  const incidentActivityList =
    data.activities
      .filter((a) => a.incidentCount > 0)
      .map((a) => `"${a.activityName ?? a.activityId} (${a.activityId}): ${a.incidentCount}"`)
      .join(", ") || "(none reported)"

  const analyzePrompt = `Triage the health of process definition \`${data.processDefinitionName ?? data.processDefinitionKey}\` (key \`${data.processDefinitionKey}\`, version ${data.version}, engine \`${engineId}\`). Current state: ${data.openIncidents} open incident(s), ${data.failedJobs} failed job(s), ${data.affectedActivityCount} of ${data.totalActivityCount} activities affected, ${data.runningInstances} running instances. Problem activities: ${problemActivityList}. Use camunda7_list_incidents and camunda7_list_jobs (filter by processDefinitionKey \`${data.processDefinitionKey}\`) to pull the real incident/exception messages, cluster them by root cause, and use camunda7_query_historic_activity_instances to see whether the same failures recur. Tell me: the single most likely root cause per cluster, which activities are symptoms vs. sources, and a concrete recommended fix (batch retry, variable change, modification, or migration). Do NOT mutate anything — diagnosis only.`

  const draftTicketPrompt = `Draft an incident ticket for process \`${data.processDefinitionName ?? data.processDefinitionKey}\` (key \`${data.processDefinitionKey}\`, version ${data.version}, engine \`${engineId}\`), which currently has ${data.openIncidents} open incident(s) across activities ${incidentActivityList}. First call camunda7_list_incidents (filter by processDefinitionKey \`${data.processDefinitionKey}\`) to get the incident ids and messages, pick the most representative open incident, then call camunda7_format_incident_issue { incidentId: <that id> } to build the draft. Present the full draft (title, body, labels) to me in the chat for review and reuse. Do NOT file it anywhere yourself — I decide where it goes; only file it if I explicitly ask, via whatever issue-tracker integration is available.`

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <div
            className={`mb-3 grid size-11 place-items-center rounded-xl text-xl ${
              headerTone === "critical"
                ? "bg-critical-soft text-critical"
                : "bg-m-blue-soft text-m-blue"
            }`}
          >
            ⊞
          </div>
          {data.openIncidents > 0 && (
            <div className="mb-3">
              <StatusBadge tone="critical">
                {data.openIncidents} open {data.openIncidents === 1 ? "incident" : "incidents"}
              </StatusBadge>
            </div>
          )}
          <h1 className="text-foreground mb-1.5 text-2xl font-bold tracking-tight">
            {title}
            {data.version !== null && (
              <span className="border-border bg-muted text-muted-foreground ml-2 inline-block rounded border px-2 py-0.5 align-middle font-mono text-xs font-medium">
                v{data.version}
              </span>
            )}
          </h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs">{data.processDefinitionKey}</span>
            {data.runningInstances !== null && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>{data.runningInstances.toLocaleString()} running instances</span>
              </>
            )}
            {cockpitUrl && <OpenInCockpitLink url={cockpitUrl} label="Open in Cockpit" />}
          </div>
        </div>
        <AskAiButton prompt={analyzePrompt} variant="primary" />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <DrillButton
          size="md"
          onDrill={() =>
            go({ type: "process-instances", processDefinitionKey: data.processDefinitionKey })
          }
        >
          View running instances
        </DrillButton>
        {data.openIncidents > 0 && (
          <DrillButton
            size="md"
            onDrill={() =>
              go({ type: "process-incidents", processDefinitionKey: data.processDefinitionKey })
            }
          >
            Open all incidents
          </DrillButton>
        )}
        {data.openIncidents > 0 && (
          <AskAiButton prompt={draftTicketPrompt} label="Draft incident ticket" variant="subtle" />
        )}
      </div>

      <KpiGrid boxed header={{ label: "Overview", badge: "Process health" }} cells={stats} />

      <section>
        <SectionHeading
          title="Process flow"
          hint={
            data.totalActivityCount !== null
              ? `${data.affectedActivityCount} of ${data.totalActivityCount} activities affected`
              : `${data.affectedActivityCount} ${
                  data.affectedActivityCount === 1 ? "activity" : "activities"
                } affected`
          }
        />
        {data.bpmnXml ? (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <div className="border-border inline-flex overflow-hidden rounded-md border text-xs">
                {(
                  [
                    ["live", "Live tokens"],
                    ["frequency", "Frequency"],
                    ["duration", "Duration"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFlowMode(m)}
                    aria-pressed={flowMode === m}
                    className={`focus-visible:ring-ring [&:not(:last-child)]:border-border px-2.5 py-1 font-medium outline-none transition-colors focus-visible:ring-2 [&:not(:last-child)]:border-r ${
                      flowMode === m
                        ? "bg-m-blue-soft text-m-blue"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {flowMode === "live" ? (
                <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ background: "#3b82f6" }}
                      aria-hidden
                    />
                    Running tokens
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ background: "#ef4444" }}
                      aria-hidden
                    />
                    Incidents / failed jobs
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">
                    {flowMode === "frequency"
                      ? "Executions / element · 30d"
                      : "Avg duration / element · 30d"}
                  </span>
                  <HeatmapLegend />
                </div>
              )}
            </div>
            {flowMode === "live" ? (
              <BpmnDiagram bpmnXml={data.bpmnXml} height={340} highlights={highlights} />
            ) : (
              <ProcessHeatmap processDefinitionKey={data.processDefinitionKey} mode={flowMode} />
            )}
          </>
        ) : (
          <Alert>
            <AlertDescription>No BPMN diagram available</AlertDescription>
          </Alert>
        )}
      </section>
    </>
  )
}

export function ProcessDetailWidget({
  data,
  processDefinitionKey,
  engine,
}: {
  data: ProcessDetailData | null
  processDefinitionKey?: string
  engine?: string
}) {
  return (
    <WidgetShell>
      <ProcessDetailView data={data} processDefinitionKey={processDefinitionKey} engine={engine} />
    </WidgetShell>
  )
}
