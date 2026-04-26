import { useMemo, useState } from "react"
import { Alert, AlertDescription, Badge, useToolMutation } from "@miragon/mcp-toolkit-ui"

import type {
  IncidentsByProcess,
  ProcessIncidentsActivity,
  ProcessIncidentsData,
  IncidentInstance,
} from "@miragon-ai/client-cibseven"

import { BpmnDiagram, type BpmnCountOverlay } from "./bpmn-diagram.js"
import { CAMUNDA7_SHOW_PROCESS_INCIDENTS } from "../tool-names.js"
import {
  CountPill,
  GroupCard,
  KpiGrid,
  SectionHeading,
  StatusBadge,
  WidgetShell,
  useHostActions,
  type HostActions,
} from "@miragon-ai/widget-shell/widgets"

export type { ProcessIncidentsData }

const INCIDENT_PREVIEW_COUNT = 5

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString()
}

function timeOnly(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString()
}

function instanceCockpitUrl(prefix: string | null, processInstanceId: string): string | null {
  if (!prefix) return null
  return `${prefix}${encodeURIComponent(processInstanceId)}`
}

function ActivitySummary({
  activity,
  expanded,
}: {
  activity: ProcessIncidentsActivity
  expanded: boolean
}) {
  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 px-4 py-3 ${
        expanded ? "border-line border-b" : ""
      }`}
    >
      <div className="bg-critical-soft text-critical grid size-6 place-items-center rounded-md text-xs font-bold">
        !
      </div>
      <div className="min-w-0">
        <div className="text-ink truncate text-sm font-semibold">
          {activity.activityName ?? activity.activityId}
        </div>
        <div className="text-ink-muted truncate font-mono text-xs">
          {activity.representativeMessage ?? activity.activityId}
        </div>
      </div>
      <div className="text-ink-muted min-w-[80px] text-right text-xs tabular-nums">
        <div className="text-ink font-semibold">{formatTimestamp(activity.firstSeen)}</div>
        <div>first seen</div>
      </div>
      <div className="text-ink-muted min-w-[80px] text-right text-xs tabular-nums">
        <div className="text-ink font-semibold">{formatTimestamp(activity.latestIncident)}</div>
        <div>latest</div>
      </div>
      <CountPill tone="critical">{activity.incidentCount}</CountPill>
      <span
        aria-hidden="true"
        className={`text-ink-subtle inline-block w-3 text-center text-xs transition-transform ${
          expanded ? "rotate-90" : ""
        }`}
      >
        ▶
      </span>
    </div>
  )
}

function IncidentTable({
  incidents,
  resolvedIds,
  resolving,
  cockpitInstanceUrlPrefix,
  onResolve,
  onOpenCockpit,
}: {
  incidents: IncidentInstance[]
  resolvedIds: Set<string>
  resolving: boolean
  cockpitInstanceUrlPrefix: string | null
  onResolve: (incidentId: string) => void
  onOpenCockpit: (url: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? incidents : incidents.slice(0, INCIDENT_PREVIEW_COUNT)
  const hidden = incidents.length - visible.length

  return (
    <div className="bg-bg text-sm">
      <div className="border-line text-ink-subtle bg-bg grid grid-cols-[140px_1fr_auto_auto] gap-4 border-b px-4 py-2 pl-12 text-[11px] font-semibold">
        <span>Instance</span>
        <span>Error message</span>
        <span className="text-right">Time</span>
        <span>Actions</span>
      </div>
      {visible.map((incident) => {
        const resolved = resolvedIds.has(incident.id)
        const instanceUrl = instanceCockpitUrl(cockpitInstanceUrlPrefix, incident.processInstanceId)
        return (
          <div
            key={incident.id}
            className={`border-line-soft hover:bg-card grid grid-cols-[140px_1fr_auto_auto] items-center gap-4 border-b px-4 py-2.5 pl-12 last:border-b-0 ${
              resolved ? "opacity-50" : ""
            }`}
          >
            <span className="text-m-blue truncate font-mono text-xs font-medium">
              {incident.processInstanceId.slice(0, 12)}…
            </span>
            <span className="text-ink-muted truncate font-mono text-xs">
              {incident.incidentMessage ?? incident.incidentType}
            </span>
            <span className="text-ink-subtle text-right font-mono text-[11px]">
              {formatTimestamp(incident.incidentTimestamp)}
            </span>
            <span className="flex items-center gap-1">
              {instanceUrl && (
                <a
                  href={instanceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault()
                    onOpenCockpit(instanceUrl)
                  }}
                  aria-label="Open instance in Cockpit"
                  className="bg-m-blue-soft text-m-blue hover:bg-m-blue/10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
                >
                  <span aria-hidden="true">▦</span> Cockpit
                </a>
              )}
              {resolved ? (
                <Badge variant="secondary" className="text-[11px]">
                  Resolved
                </Badge>
              ) : (
                <button
                  type="button"
                  disabled={resolving}
                  onClick={() => onResolve(incident.id)}
                  className="text-ink-muted border-line hover:text-ink hover:bg-line-soft bg-card inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                >
                  ↻ Retry
                </button>
              )}
            </span>
          </div>
        )
      })}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-m-blue bg-bg hover:bg-card w-full px-4 py-2 pl-12 text-left text-xs font-medium"
        >
          Show {hidden} more {hidden === 1 ? "incident" : "incidents"} in this activity →
        </button>
      )}
    </div>
  )
}

function EmptyStateWithSiblings({
  processName,
  siblings,
  onJumpTo,
}: {
  processName: string
  siblings: IncidentsByProcess[]
  onJumpTo: (key: string) => void
}) {
  return (
    <div className="border-line bg-card flex flex-col items-center gap-3 rounded-lg border px-6 py-8 text-center text-sm">
      <div className="text-ink font-medium">No open incidents on {processName}</div>
      {siblings.length === 0 ? (
        <div className="text-ink-subtle text-xs">No open incidents in the engine.</div>
      ) : (
        <>
          <div className="text-ink-muted text-xs">Other processes have open incidents:</div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {siblings.map((s) => (
              <button
                type="button"
                key={s.processDefinitionKey}
                onClick={() => onJumpTo(s.processDefinitionKey)}
                className="border-line bg-bg text-ink-muted hover:text-ink hover:bg-line-soft inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
              >
                <span className="text-ink">
                  {s.processDefinitionName ?? s.processDefinitionKey}
                </span>
                <span className="bg-critical-soft text-critical inline-flex min-w-[1.75rem] items-center justify-center rounded-md px-1.5 py-0.5 font-semibold tabular-nums">
                  {s.incidentCount}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function ProcessIncidentsWidget({ data }: { data: ProcessIncidentsData | null }) {
  const resolveMutation = useToolMutation("camunda7_resolve_incident")
  const host: HostActions = useHostActions()
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function jumpToProcess(processDefinitionKey: string) {
    host.showWidget(
      `Show me the incidents detail for process \`${processDefinitionKey}\` (use ${CAMUNDA7_SHOW_PROCESS_INCIDENTS})`,
    )
  }

  const countOverlays = useMemo<BpmnCountOverlay[]>(
    () =>
      (data?.activities ?? []).map((a) => ({
        activityId: a.activityId,
        count: a.incidentCount,
        variant: "incident",
      })),
    [data?.activities],
  )
  const incidentActivityIds = useMemo(
    () => (data?.activities ?? []).map((a) => a.activityId),
    [data?.activities],
  )

  if (!data) {
    return (
      <WidgetShell>
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </WidgetShell>
    )
  }

  function markResolved(incidentId: string) {
    setResolvedIds((prev) => new Set(prev).add(incidentId))
  }

  function handleResolve(incidentId: string) {
    resolveMutation.mutate({ incidentId }, { onSuccess: () => markResolved(incidentId) })
  }

  function toggleExpanded(activityId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(activityId)) next.delete(activityId)
      else next.add(activityId)
      return next
    })
  }

  const remainingCount = data.incidentCount - resolvedIds.size
  const title = data.processDefinitionName ?? data.processDefinitionKey
  const affectedActivityCount = data.activities.length
  const totalActivityFraction =
    data.totalActivityCount !== null
      ? `${affectedActivityCount}/${data.totalActivityCount}`
      : `${affectedActivityCount}`
  // Bind once so the click closure does not depend on TS narrowing
  // surviving across the JSX render boundary.
  const cockpitUrl = data.cockpitUrl

  return (
    <WidgetShell>
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <div className="bg-critical-soft text-critical grid size-11 place-items-center rounded-xl text-xl">
              ⚠
            </div>
            <StatusBadge tone="critical">
              {remainingCount} open {remainingCount === 1 ? "incident" : "incidents"}
            </StatusBadge>
          </div>
          <h1 className="text-ink mb-1.5 text-2xl font-bold tracking-tight">
            {title}
            {data.version !== null && (
              <span className="border-line bg-bg text-ink-muted ml-2 inline-block rounded border px-2 py-0.5 align-middle font-mono text-xs font-medium">
                v{data.version}
              </span>
            )}
          </h1>
          <div className="text-ink-muted flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs">{data.processDefinitionKey}</span>
            {data.runningInstances !== null && (
              <>
                <span className="text-ink-subtle">·</span>
                <span>{data.runningInstances.toLocaleString()} running instances</span>
              </>
            )}
            {data.latestIncident && (
              <>
                <span className="text-ink-subtle">·</span>
                <span>last event {timeOnly(data.latestIncident)}</span>
              </>
            )}
            {cockpitUrl && (
              <>
                <span className="text-ink-subtle">·</span>
                <a
                  href={cockpitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault()
                    host.openLink(cockpitUrl)
                  }}
                  className="text-m-blue hover:underline"
                >
                  <span aria-hidden="true">▦</span> Open in Cockpit{" "}
                  <span aria-hidden="true">→</span>
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      <KpiGrid
        boxed
        header={{ label: "Overview", badge: "Incidents in diesem Prozess" }}
        cells={[
          {
            label: "Open incidents",
            value: remainingCount,
            tone: remainingCount > 0 ? "critical" : undefined,
          },
          {
            label: "Activities affected",
            value: totalActivityFraction,
          },
          {
            label: "+24h",
            value: `+${data.last24hCount}`,
            tone: data.last24hCount > 0 ? "critical" : undefined,
          },
          {
            label: "Running",
            value: data.runningInstances !== null ? data.runningInstances.toLocaleString() : "—",
            tone:
              data.runningInstances !== null && data.runningInstances > 0 ? "success" : undefined,
          },
        ]}
      />

      <section>
        <SectionHeading
          title="Process flow"
          hint={
            data.totalActivityCount !== null
              ? `${affectedActivityCount} of ${data.totalActivityCount} activities failing`
              : `${affectedActivityCount} ${
                  affectedActivityCount === 1 ? "activity" : "activities"
                } failing`
          }
        />
        {data.bpmnXml ? (
          <BpmnDiagram
            bpmnXml={data.bpmnXml}
            height={460}
            highlightActivityIds={incidentActivityIds}
            countOverlays={countOverlays}
          />
        ) : (
          <Alert>
            <AlertDescription>No BPMN diagram available</AlertDescription>
          </Alert>
        )}
      </section>

      <section>
        <SectionHeading
          title="Incidents grouped by activity"
          hint={`click to expand · ${affectedActivityCount} ${
            affectedActivityCount === 1 ? "activity" : "activities"
          } affected`}
        />
        {data.activities.length === 0 ? (
          <EmptyStateWithSiblings
            processName={data.processDefinitionName ?? data.processDefinitionKey}
            siblings={data.siblingsWithIncidents}
            onJumpTo={jumpToProcess}
          />
        ) : (
          data.activities.map((activity) => (
            <GroupCard
              key={activity.activityId}
              expanded={expanded.has(activity.activityId)}
              onToggle={() => toggleExpanded(activity.activityId)}
              summary={
                <ActivitySummary activity={activity} expanded={expanded.has(activity.activityId)} />
              }
            >
              <IncidentTable
                incidents={activity.incidents}
                resolvedIds={resolvedIds}
                resolving={resolveMutation.isPending}
                cockpitInstanceUrlPrefix={data.cockpitInstanceUrlPrefix}
                onResolve={handleResolve}
                onOpenCockpit={host.openLink}
              />
            </GroupCard>
          ))
        )}
      </section>
    </WidgetShell>
  )
}
