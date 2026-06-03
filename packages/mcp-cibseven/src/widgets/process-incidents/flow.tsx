import { useMemo } from "react"
import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import { SectionHeading, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "@miragon-ai/client-cibseven"
import { BpmnDiagram, type BpmnHighlight } from "../bpmn-diagram.js"

export function ProcessIncidentFlow({ data }: { data: ProcessIncidentsData | null }) {
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
        <Alert>
          <AlertDescription>No data available</AlertDescription>
        </Alert>
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
