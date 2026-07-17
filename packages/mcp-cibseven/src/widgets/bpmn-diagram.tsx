import { useEffect } from "react"
import { useWidget } from "mcp-use/react"
import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import { BpmnZoomControls, useBpmnViewer } from "@miragon-ai/widget-shell/widgets"
import { applyHighlights, HIGHLIGHT_CSS, type BpmnHighlight } from "./bpmn-highlights.js"

// The highlight semantics (colors, CSS, priority rules) live in
// ./bpmn-highlights.ts; re-exported here so widget callers keep importing
// the diagram and its highlight type from one place.
export { applyHighlights, dedupe, HIGHLIGHT_COLORS, type BpmnHighlight } from "./bpmn-highlights.js"

export interface BpmnDiagramProps {
  bpmnXml: string
  height?: number
  /**
   * Declarative highlight set. Empty / undefined renders the diagram as
   * plain BPMN without overlays.
   */
  highlights?: ReadonlyArray<BpmnHighlight>
}

function injectHighlightCss() {
  if (document.getElementById("bpmn-highlight-css")) return
  const style = document.createElement("style")
  style.id = "bpmn-highlight-css"
  style.textContent = HIGHLIGHT_CSS
  document.head.appendChild(style)
}

export function BpmnDiagram({ bpmnXml, height = 400, highlights = [] }: BpmnDiagramProps) {
  const { displayMode } = useWidget()

  const { containerRef, importError, zoomIn, zoomOut, fit } = useBpmnViewer({
    bpmnXml,
    // A changed highlight set redecorates via a full re-import — bpmn-js
    // markers/overlays are only ever added, never removed.
    reimportKey: highlights,
    fitOnResize: true,
    onImported: (viewer) => {
      injectHighlightCss()
      applyHighlights(viewer.get("canvas"), viewer.get("overlays"), highlights)
    },
  })

  // Host layout switches (inline ↔ fullscreen) resize the container — refit.
  useEffect(() => {
    fit()
  }, [displayMode, fit])

  return (
    <div className="relative">
      <div
        ref={containerRef}
        role="img"
        aria-label="BPMN process diagram"
        className="border-border rounded-lg border"
        style={{ height: `${height}px`, width: "100%" }}
      />
      {importError !== null && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <Alert>
            <AlertDescription>Unable to render the BPMN diagram.</AlertDescription>
          </Alert>
        </div>
      )}
      <BpmnZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} onFit={fit} />
    </div>
  )
}
