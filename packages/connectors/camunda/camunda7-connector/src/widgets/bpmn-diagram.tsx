import { useEffect } from "react"
import { ErrorState } from "@miragon/mcp-toolkit-ui"
import {
  BpmnZoomControls,
  injectBpmnOverlayCss,
  useBpmnViewer,
  useHostDisplayMode,
} from "@miragon-ai/widget-shell/widgets"
import { useT } from "../messages/use-t.js"
import { applyHighlights, type BpmnHighlight } from "./bpmn-highlights.js"

// The highlight semantics (colors, CSS, priority rules) live in
// ./bpmn-highlights.ts; re-exported here so widget callers keep importing
// the diagram and its highlight type from one place.
export { applyHighlights, dedupe, HIGHLIGHT_COLORS, type BpmnHighlight } from "./bpmn-highlights.js"

export interface BpmnDiagramProps {
  bpmnXml: string
  /** A fixed frame height; default: the diagram's own (240–560 px, the kit's `diagramHeight`). */
  height?: number
  /**
   * Declarative highlight set. Empty / undefined renders the diagram as
   * plain BPMN without overlays.
   */
  highlights?: ReadonlyArray<BpmnHighlight>
}

// Stable default: an inline `[]` default would mint a fresh identity per render
// and, via `reimportKey`, force a full bpmn-js re-import for any non-memoizing
// caller.
const NO_HIGHLIGHTS: ReadonlyArray<BpmnHighlight> = []

export function BpmnDiagram({ bpmnXml, height, highlights = NO_HIGHLIGHTS }: BpmnDiagramProps) {
  const t = useT()
  const displayMode = useHostDisplayMode()

  const {
    containerRef,
    height: autoHeight,
    importError,
    zoomIn,
    zoomOut,
    fit,
  } = useBpmnViewer({
    bpmnXml,
    // A changed highlight set redecorates via a full re-import — bpmn-js
    // markers/overlays are only ever added, never removed.
    reimportKey: highlights,
    fitOnResize: true,
    onImported: (imported) => {
      injectBpmnOverlayCss()
      applyHighlights(imported.get("canvas"), imported.get("overlays"), highlights)
    },
  })

  // Host layout switches (inline ↔ fullscreen) resize the container — refit.
  useEffect(() => {
    fit()
  }, [displayMode, fit])

  // The paper, its zoom bar and its error stay light in a dark host (CI §10).
  return (
    <div data-theme-mode="light" className="relative">
      <div
        ref={containerRef}
        role="img"
        aria-label={t("bpmnDiagram.ariaLabel")}
        className="border-border rounded-md border"
        style={{ height: `${height ?? autoHeight}px`, width: "100%" }}
      />
      {importError !== null && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <ErrorState variant="inline" title={t("bpmnDiagram.renderError")} details={importError} />
        </div>
      )}
      <BpmnZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} onFit={fit} />
    </div>
  )
}
