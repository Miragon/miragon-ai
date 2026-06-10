import { useState } from "react"
import { Alert, AlertDescription, useToolMutation } from "@miragon/mcp-toolkit-ui"
import { GroupCard, SectionHeading, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "../../view-models.js"
import { useNav } from "../navigation.js"
import { CAMUNDA7_PROCESS_INCIDENTS_DATA } from "../../tool-names.js"
import { useViewData } from "../use-view-data.js"
import { ActivitySummary } from "./activity-summary.js"
import { IncidentTable } from "./incident-table.js"
import { EmptyStateWithSiblings } from "./empty-state.js"

export function ActivityIncidentList({
  data: initialData = null,
  processDefinitionKey,
  engine,
}: {
  data?: ProcessIncidentsData | null
  processDefinitionKey?: string
  engine?: string
}) {
  const resolveMutation = useToolMutation("camunda7_resolve_incident")
  const go = useNav()
  const { data, loading, error } = useViewData<ProcessIncidentsData>(
    initialData,
    ["camunda7:process-incidents", engine ?? null, processDefinitionKey ?? null],
    CAMUNDA7_PROCESS_INCIDENTS_DATA,
    { processDefinitionKey, engine },
    !!processDefinitionKey,
  )
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (!data) {
    return (
      <WidgetShell>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : (
          <div className="text-muted-foreground p-2 text-sm">
            {loading ? "Loading…" : "No data available"}
          </div>
        )}
      </WidgetShell>
    )
  }

  function jumpToProcess(processDefinitionKey: string) {
    go({ type: "process-incidents", processDefinitionKey })
  }

  function analyzeIncident(incidentId: string) {
    go({ type: "incident-detail", incidentId })
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

  const affectedActivityCount = data.activities.length

  return (
    <WidgetShell>
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
                onAnalyze={analyzeIncident}
              />
            </GroupCard>
          ))
        )}
      </section>
    </WidgetShell>
  )
}
