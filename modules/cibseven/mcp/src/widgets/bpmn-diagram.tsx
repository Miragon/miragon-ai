import { useEffect, useRef } from "react"
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer"

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
.failed-count-overlay,
.incident-count-overlay {
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

export interface BpmnCountOverlay {
  activityId: string
  count: number
  variant: "incident" | "instance" | "failed"
}

export interface BpmnDiagramProps {
  bpmnXml: string
  height?: number
  highlightActivityIds?: string[]
  activeActivityIds?: string[]
  countOverlays?: BpmnCountOverlay[]
}

const OVERLAY_CLASS: Record<BpmnCountOverlay["variant"], string> = {
  incident: "incident-count-overlay",
  instance: "instance-count-overlay",
  failed: "failed-count-overlay",
}

const OVERLAY_POSITION: Record<BpmnCountOverlay["variant"], object> = {
  incident: { top: -14, left: -14 },
  instance: { top: -14, right: -14 },
  failed: { top: -14, left: -14 },
}

export function BpmnDiagram({
  bpmnXml,
  height = 400,
  highlightActivityIds = [],
  activeActivityIds = [],
  countOverlays = [],
}: BpmnDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !bpmnXml) return

    if (!document.getElementById("bpmn-highlight-css")) {
      const style = document.createElement("style")
      style.id = "bpmn-highlight-css"
      style.textContent = HIGHLIGHT_CSS
      document.head.appendChild(style)
    }

    const viewer = new NavigatedViewer({ container: containerRef.current })

    void viewer.importXML(bpmnXml).then(() => {
      const bpmn = viewer as unknown as BpmnViewerWithGet
      const canvas = bpmn.get("canvas")
      canvas.zoom("fit-viewport")

      for (const actId of activeActivityIds) {
        try {
          canvas.addMarker(actId, "highlight-running")
        } catch {
          /* activity may not exist in diagram */
        }
      }

      for (const actId of highlightActivityIds) {
        try {
          canvas.addMarker(actId, "highlight-incident")
        } catch {
          /* activity may not exist in diagram */
        }
      }

      const overlays = bpmn.get("overlays")
      for (const o of countOverlays) {
        const safeCount = Number(o.count) || 0
        if (safeCount <= 0) continue
        try {
          overlays.add(o.activityId, {
            position: OVERLAY_POSITION[o.variant],
            html: `<div class="${OVERLAY_CLASS[o.variant]}">${safeCount}</div>`,
          })
        } catch {
          /* activity may not exist in diagram */
        }
      }
    })

    return () => {
      viewer.destroy()
    }
  }, [bpmnXml, highlightActivityIds, activeActivityIds, countOverlays])

  return (
    <div
      ref={containerRef}
      className="border-border overflow-hidden rounded-lg border"
      style={{ height: `${height}px`, width: "100%" }}
    />
  )
}
