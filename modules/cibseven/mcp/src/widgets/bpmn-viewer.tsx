import { Alert, AlertDescription, Badge } from "@miragon/mcp-toolkit-ui"
import type { BpmnViewerData } from "@miragon-ai/client-cibseven"
import { BpmnDiagram, type BpmnCountOverlay } from "./bpmn-diagram.js"

export type { BpmnViewerData }

export function BpmnViewerWidget({ data }: { data: BpmnViewerData | null }) {
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

  const totalActive = data.activeActivityIds.length
  const totalIncidents = data.incidentActivityIds.length

  const countOverlays: BpmnCountOverlay[] = []
  for (const stat of data.activityStats) {
    if (stat.instances > 0) {
      countOverlays.push({ activityId: stat.id, count: stat.instances, variant: "instance" })
    }
    if (stat.failedJobs > 0) {
      countOverlays.push({ activityId: stat.id, count: stat.failedJobs, variant: "failed" })
    }
  }

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">BPMN Diagram</h2>
        <div className="flex items-center gap-2">
          {data.processInstanceId && (
            <Badge variant="secondary" className="font-mono text-xs">
              {data.processInstanceId}
            </Badge>
          )}
          {totalActive > 0 && (
            <Badge variant="secondary" className="bg-success/10 text-success-foreground">
              {totalActive} active
            </Badge>
          )}
          {totalIncidents > 0 && <Badge variant="destructive">{totalIncidents} incidents</Badge>}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border-2 border-green-600 bg-green-600/15" />
          <span className="text-muted-foreground">Running</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border-2 border-red-600 bg-red-600/15" />
          <span className="text-muted-foreground">Incident</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-4 min-w-4 rounded-full bg-blue-500 px-1 text-center text-[10px] font-semibold text-white">
            n
          </span>
          <span className="text-muted-foreground">Instance count</span>
        </div>
      </div>

      <BpmnDiagram
        bpmnXml={data.bpmnXml}
        height={500}
        activeActivityIds={data.activeActivityIds}
        highlightActivityIds={data.incidentActivityIds}
        countOverlays={countOverlays}
      />
    </div>
  )
}
