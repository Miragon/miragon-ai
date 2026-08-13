import { useMemo } from "react"
import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import type { BpmnViewerData } from "../../view-models.js"
import { BpmnDiagram, type BpmnHighlight } from "../bpmn-diagram.js"
import { useT } from "../../messages/use-t.js"

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
  const t = useT()

  if (!data) {
    return (
      <Alert>
        <AlertDescription>{t("bpmnFlow.noData")}</AlertDescription>
      </Alert>
    )
  }

  if (!data.bpmnXml) {
    return (
      <Alert>
        <AlertDescription>{t("bpmnFlow.noDiagram")}</AlertDescription>
      </Alert>
    )
  }

  return <BpmnDiagram bpmnXml={data.bpmnXml} height={500} highlights={highlights} />
}
