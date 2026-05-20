import { useState } from "react"
import { Alert, AlertDescription, useToolMutation } from "@miragon/mcp-toolkit-ui"
import {
  GroupCard,
  SectionHeading,
  WidgetShell,
  useHostActions,
  type HostActions,
} from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "@miragon-ai/client-cibseven"
import { CAMUNDA7_SHOW_INCIDENT_DETAIL, CAMUNDA7_SHOW_PROCESS_INCIDENTS } from "../../tool-names.js"
import { ActivitySummary } from "./activity-summary.js"
import { IncidentTable } from "./incident-table.js"
import { EmptyStateWithSiblings } from "./empty-state.js"

export function ActivityIncidentList({ data }: { data: ProcessIncidentsData | null }) {
  const resolveMutation = useToolMutation("camunda7_resolve_incident")
  const host: HostActions = useHostActions()
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (!data) {
    return (
      <WidgetShell>
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </WidgetShell>
    )
  }

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
