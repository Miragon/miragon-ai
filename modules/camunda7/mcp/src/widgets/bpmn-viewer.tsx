import { useEffect, useRef } from "react"
import { Alert, AlertDescription, Badge } from "@miragon/mcp-toolkit-ui"
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer"
import type { BpmnViewerData } from "@automation-mcp/client-camunda7"

export type { BpmnViewerData }

interface BpmnCanvas {
  zoom: (mode: string) => void
  addMarker: (elementId: string, marker: string) => void
}

interface BpmnOverlays {
  add: (elementId: string, overlay: { position: object; html: string }) => void
}

interface BpmnViewerWithGet {
  get: ((service: "canvas") => BpmnCanvas) & ((service: "overlays") => BpmnOverlays)
}

const HIGHLIGHT_CSS = `
.highlight-running:not(.djs-connection) .djs-visual > :nth-child(1) {
  fill: rgba(34, 197, 94, 0.15) !important;
  stroke: #16a34a !important;
  stroke-width: 2px !important;
}
.highlight-incident:not(.djs-connection) .djs-visual > :nth-child(1) {
  fill: rgba(239, 68, 68, 0.15) !important;
  stroke: #dc2626 !important;
  stroke-width: 2px !important;
}
.instance-count-overlay {
  background: #3b82f6;
  color: white;
  border-radius: 9999px;
  min-width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  padding: 0 6px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  font-family: ui-sans-serif, system-ui, sans-serif;
}
.failed-count-overlay {
  background: #ef4444;
  color: white;
  border-radius: 9999px;
  min-width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  padding: 0 6px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  font-family: ui-sans-serif, system-ui, sans-serif;
}
`

export function BpmnViewerWidget({ data }: { data: BpmnViewerData | null }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<NavigatedViewer | null>(null)

  useEffect(() => {
    if (!containerRef.current || !data?.bpmnXml) return

    // Inject highlight CSS once
    if (!document.getElementById("bpmn-highlight-css")) {
      const style = document.createElement("style")
      style.id = "bpmn-highlight-css"
      style.textContent = HIGHLIGHT_CSS
      document.head.appendChild(style)
    }

    const viewer = new NavigatedViewer({ container: containerRef.current })
    viewerRef.current = viewer

    void viewer.importXML(data.bpmnXml).then(() => {
      const bpmn = viewer as unknown as BpmnViewerWithGet
      const canvas = bpmn.get("canvas")
      canvas.zoom("fit-viewport")

      // Highlight active activities
      for (const actId of data.activeActivityIds) {
        try {
          canvas.addMarker(actId, "highlight-running")
        } catch {
          /* activity may not exist in diagram */
        }
      }

      // Highlight incident activities
      for (const actId of data.incidentActivityIds) {
        try {
          canvas.addMarker(actId, "highlight-incident")
        } catch {
          /* activity may not exist in diagram */
        }
      }

      // Add instance count overlays
      const overlays = bpmn.get("overlays")
      for (const stat of data.activityStats) {
        if (stat.instances > 0) {
          overlays.add(stat.id, {
            position: { top: -14, right: -14 },
            html: `<div class="instance-count-overlay">${stat.instances}</div>`,
          })
        }
        if (stat.failedJobs > 0) {
          overlays.add(stat.id, {
            position: { top: -14, left: -14 },
            html: `<div class="failed-count-overlay">${stat.failedJobs}</div>`,
          })
        }
      }
    })

    return () => {
      viewer.destroy()
      viewerRef.current = null
    }
  }, [data?.bpmnXml, data?.activeActivityIds, data?.incidentActivityIds, data?.activityStats])

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

      <div
        ref={containerRef}
        className="border-border overflow-hidden rounded-lg border"
        style={{ height: "500px", width: "100%" }}
      />
    </div>
  )
}
