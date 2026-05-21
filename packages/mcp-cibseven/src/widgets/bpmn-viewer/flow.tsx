import { useMemo } from "react"
import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import type { BpmnViewerData } from "@miragon-ai/client-cibseven"
import { BpmnDiagram, type BpmnHighlight } from "../bpmn-diagram.js"

/**
 * Renders the BPMN canvas with active/incident/failed-job/instance-count
 * overlays computed from the shared `BpmnViewerData` slice. Empty/missing
 * data renders a neutral alert (parent layout still composes header/legend).
 */
export function BpmnFlowViewer({ data }: { data: BpmnViewerData | null }) {
  const highlights = useMemo<BpmnHighlight[]>(
    () => [
      { kind: "active", activityIds: data?.activeActivityIds ?? [] },
      { kind: "incident", activityIds: data?.incidentActivityIds ?? [] },
      {
        kind: "failed-jobs",
        counts: (data?.activityStats ?? [])
          .filter((s) => s.failedJobs > 0)
          .map((s) => ({ activityId: s.id, count: s.failedJobs })),
      },
      {
        kind: "instance-count",
        counts: (data?.activityStats ?? [])
          .filter((s) => s.instances > 0)
          .map((s) => ({ activityId: s.id, count: s.instances })),
      },
    ],
    [data?.activeActivityIds, data?.incidentActivityIds, data?.activityStats],
  )

  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!data.bpmnXml) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert>
          <AlertDescription>No BPMN diagram available</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="bg-card text-card-foreground px-6 pb-6">
      <BpmnDiagram bpmnXml={data.bpmnXml} height={500} highlights={highlights} />
    </div>
  )
}
