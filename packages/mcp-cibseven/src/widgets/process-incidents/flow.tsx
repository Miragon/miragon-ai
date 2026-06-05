import { useMemo } from "react"
import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import { SectionHeading, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "@miragon-ai/client-cibseven"
import { BpmnDiagram, type BpmnHighlight } from "../bpmn-diagram.js"
import { CAMUNDA7_PROCESS_INCIDENTS_DATA } from "../../tool-names.js"
import { useViewData } from "../use-view-data.js"

export function ProcessIncidentFlow({
  data: initialData = null,
  processDefinitionKey,
  engine,
}: {
  data?: ProcessIncidentsData | null
  processDefinitionKey?: string
  engine?: string
}) {
  const { data, loading, error } = useViewData<ProcessIncidentsData>(
    initialData,
    ["camunda7:process-incidents", engine ?? null, processDefinitionKey ?? null],
    CAMUNDA7_PROCESS_INCIDENTS_DATA,
    { processDefinitionKey, engine },
    !!processDefinitionKey,
  )

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

  const affectedActivityCount = data.activities.length

  return (
    <WidgetShell>
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
    </WidgetShell>
  )
}
