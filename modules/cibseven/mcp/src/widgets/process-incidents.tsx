import { useMemo, useState } from "react"
import { Alert, AlertDescription, useToolMutation } from "@miragon/mcp-toolkit-ui"

import type { ProcessIncidentsData } from "@miragon-ai/client-cibseven"

import { BpmnDiagram, type BpmnHighlight } from "./bpmn-diagram.js"
import { CAMUNDA7_SHOW_INCIDENT_DETAIL, CAMUNDA7_SHOW_PROCESS_INCIDENTS } from "../tool-names.js"
import {
  GroupCard,
  KpiGrid,
  SectionHeading,
  StatusBadge,
  WidgetShell,
  useHostActions,
  type HostActions,
} from "@miragon-ai/widget-shell/widgets"
import { ActivitySummary } from "./process-incidents/activity-summary.js"
import { IncidentTable } from "./process-incidents/incident-table.js"
import { EmptyStateWithSiblings } from "./process-incidents/empty-state.js"
import { formatTime } from "../lib/format-time.js"

export type { ProcessIncidentsData }

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

  function analyzeIncident(incidentId: string) {
    host.showWidget(
      `Analyze incident \`${incidentId}\` in detail (use ${CAMUNDA7_SHOW_INCIDENT_DETAIL})`,
    )
  }

  const highlights = useMemo<BpmnHighlight[]>(() => {
    const activities = data?.activities ?? []
    return [
      {
        kind: "incident",
        activityIds: activities.map((a) => a.activityId),
        counts: activities.map((a) => ({ activityId: a.activityId, count: a.incidentCount })),
      },
    ]
  }, [data?.activities])

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
                <span>last event {formatTime(data.latestIncident)}</span>
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
          <BpmnDiagram bpmnXml={data.bpmnXml} height={460} highlights={highlights} />
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
                onResolve={handleResolve}
                onOpenCockpit={host.openLink}
                onAnalyze={analyzeIncident}
              />
            </GroupCard>
          ))
        )}
      </section>
    </WidgetShell>
  )
}
