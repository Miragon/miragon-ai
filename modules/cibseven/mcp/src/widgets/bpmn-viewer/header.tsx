import { Badge } from "@miragon/mcp-toolkit-ui"
import type { BpmnViewerData } from "@miragon-ai/client-cibseven"

export function BpmnViewerHeader({ data }: { data: BpmnViewerData | null }) {
  if (!data) return null
  const totalActive = data.activeActivityIds.length
  const totalIncidents = data.incidentActivityIds.length
  return (
    <div className="bg-card text-card-foreground flex items-center justify-between px-6 pt-6">
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
  )
}
