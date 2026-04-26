import { useEffect, useRef } from "react"
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer"

interface BpmnCanvas {
  zoom(mode: "fit-viewport"): void
  zoom(level: number): void
  zoom(): number
  addMarker(elementId: string, marker: string): void
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
.highlight-open-user-task:not(.djs-connection) .djs-visual > :nth-child(1) {
  fill: rgba(34, 197, 94, 0.22) !important;
  stroke: #15803d !important;
  stroke-width: 3px !important;
  animation: bpmn-active-task-pulse 1.6s ease-in-out infinite;
}
@keyframes bpmn-active-task-pulse {
  0%, 100% { stroke-opacity: 1; }
  50% { stroke-opacity: 0.45; }
}
.highlight-incident:not(.djs-connection) .djs-visual > :nth-child(1) {
  fill: rgba(239, 68, 68, 0.15) !important;
  stroke: #dc2626 !important;
  stroke-width: 2px !important;
}
.bpmn-overlay-badge {
  border-radius: 9999px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  padding: 0 6px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  font-family: ui-sans-serif, system-ui, sans-serif;
  color: white;
}
.bpmn-overlay-badge--instance-count {
  background: #3b82f6;
  min-width: 22px;
}
.bpmn-overlay-badge--incident-count {
  background: #ef4444;
  min-width: 22px;
}
.bpmn-overlay-badge--open-task {
  background: #15803d;
  gap: 4px;
  padding: 0 8px;
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 1px 3px rgba(0,0,0,0.25);
}
.bpmn-overlay-badge--open-task::before {
  content: "▸";
  font-size: 12px;
  line-height: 1;
}
`

/**
 * Semantic highlight modes for {@link BpmnDiagram}. Each kind has one
 * canonical visual treatment so a caller can declare *what* it wants to
 * show without picking colors or overlay positions.
 *
 * When the same activity appears in multiple kinds the priority is
 * `incident > open-task > active`. Lower-priority markers are skipped
 * for that activity so the SVG is never decorated with two competing
 * fills.
 */
export type BpmnHighlight =
  | { kind: "active"; activityIds: string[] }
  | {
      kind: "incident"
      activityIds: string[]
      /** Optional red count badge per activity (top-left). */
      counts?: ReadonlyArray<{ activityId: string; count: number }>
    }
  | {
      kind: "open-task"
      tasks: ReadonlyArray<{ activityId: string; label?: string }>
    }
  | {
      kind: "instance-count"
      counts: ReadonlyArray<{ activityId: string; count: number }>
    }

export interface BpmnDiagramProps {
  bpmnXml: string
  height?: number
  /**
   * Declarative highlight set. Empty / undefined renders the diagram as
   * plain BPMN without overlays.
   */
  highlights?: ReadonlyArray<BpmnHighlight>
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values))
}

function safeAddMarker(canvas: BpmnCanvas, activityId: string, marker: string) {
  try {
    canvas.addMarker(activityId, marker)
  } catch {
    /* activity may not exist in the rendered diagram */
  }
}

function safeAddOverlay(
  overlays: BpmnOverlays,
  activityId: string,
  overlay: { position: object; html: string },
) {
  try {
    overlays.add(activityId, overlay)
  } catch {
    /* activity may not exist in the rendered diagram */
  }
}

function applyHighlights(
  canvas: BpmnCanvas,
  overlays: BpmnOverlays,
  highlights: ReadonlyArray<BpmnHighlight>,
) {
  const incidentIds: string[] = []
  const openTaskIds: string[] = []
  const activeIds: string[] = []

  for (const h of highlights) {
    if (h.kind === "incident") {
      incidentIds.push(...h.activityIds)
    } else if (h.kind === "open-task") {
      openTaskIds.push(...h.tasks.map((t) => t.activityId))
    } else if (h.kind === "active") {
      activeIds.push(...h.activityIds)
    }
  }

  const incidentSet = new Set(incidentIds)
  const openTaskSet = new Set(openTaskIds)

  for (const id of dedupe(activeIds)) {
    if (incidentSet.has(id) || openTaskSet.has(id)) continue
    safeAddMarker(canvas, id, "highlight-running")
  }
  for (const id of dedupe(openTaskIds)) {
    if (incidentSet.has(id)) continue
    safeAddMarker(canvas, id, "highlight-open-user-task")
  }
  for (const id of dedupe(incidentIds)) {
    safeAddMarker(canvas, id, "highlight-incident")
  }

  for (const h of highlights) {
    if (h.kind === "incident" && h.counts) {
      for (const c of h.counts) {
        const safeCount = Number(c.count) || 0
        if (safeCount <= 0) continue
        safeAddOverlay(overlays, c.activityId, {
          position: { top: -14, left: -14 },
          html: `<div class="bpmn-overlay-badge bpmn-overlay-badge--incident-count">${safeCount}</div>`,
        })
      }
    } else if (h.kind === "instance-count") {
      for (const c of h.counts) {
        const safeCount = Number(c.count) || 0
        if (safeCount <= 0) continue
        safeAddOverlay(overlays, c.activityId, {
          position: { top: -14, right: -14 },
          html: `<div class="bpmn-overlay-badge bpmn-overlay-badge--instance-count">${safeCount}</div>`,
        })
      }
    } else if (h.kind === "open-task") {
      for (const task of h.tasks) {
        const label = escapeHtml(task.label ?? "Open task")
        safeAddOverlay(overlays, task.activityId, {
          position: { bottom: -16, left: -8 },
          html: `<div class="bpmn-overlay-badge bpmn-overlay-badge--open-task" title="${label}">${label}</div>`,
        })
      }
    }
  }
}

export function BpmnDiagram({ bpmnXml, height = 400, highlights = [] }: BpmnDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<NavigatedViewer | null>(null)

  useEffect(() => {
    if (!containerRef.current || !bpmnXml) return

    if (!document.getElementById("bpmn-highlight-css")) {
      const style = document.createElement("style")
      style.id = "bpmn-highlight-css"
      style.textContent = HIGHLIGHT_CSS
      document.head.appendChild(style)
    }

    const viewer = new NavigatedViewer({ container: containerRef.current })
    viewerRef.current = viewer

    void viewer.importXML(bpmnXml).then(() => {
      const bpmn = viewer as unknown as BpmnViewerWithGet
      const canvas = bpmn.get("canvas")
      canvas.zoom("fit-viewport")
      canvas.zoom(canvas.zoom() * 0.95)

      const overlays = bpmn.get("overlays")
      applyHighlights(canvas, overlays, highlights)
    })

    return () => {
      viewerRef.current = null
      viewer.destroy()
    }
  }, [bpmnXml, highlights])

  function getCanvas(): BpmnCanvas | null {
    if (!viewerRef.current) return null
    return (viewerRef.current as unknown as BpmnViewerWithGet).get("canvas")
  }

  function handleZoomIn() {
    const canvas = getCanvas()
    if (canvas) canvas.zoom(canvas.zoom() * 1.1)
  }

  function handleZoomOut() {
    const canvas = getCanvas()
    if (canvas) canvas.zoom(canvas.zoom() * 0.9)
  }

  function handleFit() {
    const canvas = getCanvas()
    if (!canvas) return
    canvas.zoom("fit-viewport")
    canvas.zoom(canvas.zoom() * 0.95)
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="border-border rounded-lg border"
        style={{ height: `${height}px`, width: "100%" }}
      />
      <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded border border-gray-300 shadow-sm">
        {[
          { label: "+", onClick: handleZoomIn, title: "Zoom in" },
          { label: "⊡", onClick: handleFit, title: "Fit to viewport" },
          { label: "−", onClick: handleZoomOut, title: "Zoom out" },
        ].map(({ label, onClick, title }) => (
          <button
            key={label}
            onClick={onClick}
            title={title}
            className="flex h-7 w-7 items-center justify-center bg-white text-sm text-gray-700 hover:bg-gray-100 active:bg-gray-200 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-gray-300"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
