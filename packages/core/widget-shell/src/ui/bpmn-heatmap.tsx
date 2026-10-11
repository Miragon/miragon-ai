import { useEffect, useRef } from "react"
import { ErrorState, useLocale } from "@miragon/mcp-toolkit-ui"
import {
  buildGradientLut,
  buildHeatPoints,
  drawHeatLayer,
  HEAT_GRADIENT_CSS,
  HEAT_PEAK_ALPHA,
  type HeatPoint,
} from "./bpmn-heatmap/heat-utils.js"
import { DEFAULT_HEATMAP_LABELS, type BpmnHeatmapLabels } from "./bpmn-heatmap-labels.js"
import { BpmnZoomControls } from "./bpmn-zoom-controls.js"
import { kitLabels } from "./kit-labels.js"
import { useBpmnViewer } from "./use-bpmn-viewer.js"

// Stable default for the omitted-edges case: a `= {}` parameter default would
// be a fresh identity per render and re-trigger the repaint effect every time.
const EMPTY_EDGES: Record<string, number> = {}

export type { BpmnHeatmapLabels }

export interface BpmnHeatmapProps {
  bpmnXml: string
  /** Per-element heat value keyed by BPMN element id (frequency or duration). */
  nodeFrequencies: Record<string, number>
  /** Per-edge value keyed by `${sourceId}->${targetId}`. Metrics carry none → `{}`. */
  edgeFrequencies?: Record<string, number>
  /** A fixed frame height; default: from the diagram's aspect ratio (240–560 px). */
  height?: number
  /** Heat radius in diagram coordinates. Scales with zoom. */
  diagramRadius?: number
  /** Accessible name for the diagram (localize per module; English fallback). */
  diagramAriaLabel?: string
  /** Title of the import-error state (English fallback): what happened, one line. */
  errorTitle?: string
  /**
   * Next step under the import error: what the user can do. No fallback, so
   * a caller without a localized hint shows no English sentence in its view.
   */
  errorHint?: string
  /**
   * Shown over the diagram when NO element carries a positive value. Without
   * it an empty result (window with no traffic, or a metrics `engine_id` that
   * doesn't match the configured engine id) is indistinguishable from a
   * rendered heatmap — the diagram just stays uncolored.
   */
  noHeatLabel?: string
}

/**
 * Renders a BPMN diagram (bpmn-js NavigatedViewer) with a Cockpit-style heat
 * overlay on a canvas synced to the viewbox. The viewer mounts once per diagram
 * (`bpmnXml`); changing `nodeFrequencies` (e.g. the frequency↔duration toggle)
 * only repaints the overlay — no re-import / refit.
 *
 * The heat is ONE hue (`--cd-info-soft` → `--cd-blau`, never red: red is for
 * incidents), every element with a value above zero at a visible minimum.
 * The whole frame is a forced-light island: the paper, the zoom bar and the
 * "no values" chip stay light in a dark host. Pair it with
 * {@link HeatmapLegend} and the values as a table ({@link HeatValuesTable}).
 */
export function BpmnHeatmap({
  bpmnXml,
  nodeFrequencies,
  edgeFrequencies = EMPTY_EDGES,
  height,
  diagramRadius = 55,
  diagramAriaLabel = DEFAULT_HEATMAP_LABELS.diagramAriaLabel,
  errorTitle = DEFAULT_HEATMAP_LABELS.errorTitle,
  errorHint,
  noHeatLabel = DEFAULT_HEATMAP_LABELS.noHeat,
}: BpmnHeatmapProps) {
  const heatCanvasRef = useRef<HTMLCanvasElement>(null)
  const redrawRef = useRef<(() => void) | null>(null)
  // Latest heat inputs, read by redraw() so we can repaint without re-importing.
  // Synced in an effect (not during render) so a discarded render can't leak
  // into the ref; declared before the repaint effect below, so redraw() always
  // sees the values of the commit that triggered it.
  const dataRef = useRef({ nodeFrequencies, edgeFrequencies, diagramRadius })
  useEffect(() => {
    dataRef.current = { nodeFrequencies, edgeFrequencies, diagramRadius }
  })

  const {
    containerRef,
    height: autoHeight,
    importError,
    zoomIn,
    zoomOut,
    fit,
  } = useBpmnViewer({
    bpmnXml,
    onImported: (imported) => {
      const gradientLut = buildGradientLut()
      const canvas = imported.get("canvas")
      const elementRegistry = imported.get("elementRegistry")
      const eventBus = imported.get("eventBus")

      const redraw = () => {
        const heatCanvas = heatCanvasRef.current
        const container = containerRef.current
        if (!heatCanvas || !container) return
        const rect = container.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        if (
          heatCanvas.width !== Math.round(rect.width * dpr) ||
          heatCanvas.height !== Math.round(rect.height * dpr)
        ) {
          heatCanvas.width = Math.round(rect.width * dpr)
          heatCanvas.height = Math.round(rect.height * dpr)
          heatCanvas.style.width = `${rect.width}px`
          heatCanvas.style.height = `${rect.height}px`
        }
        const ctx = heatCanvas.getContext("2d")
        if (!ctx) return
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        const { nodeFrequencies: nf, edgeFrequencies: ef, diagramRadius: dr } = dataRef.current
        const heatPoints = buildHeatPoints(elementRegistry.getAll(), nf, ef)
        const maxWeight = heatPoints.reduce((m, p) => (p.weight > m ? p.weight : m), 0)
        const vb = canvas.viewbox()
        const scale = vb.scale
        // Project diagram coordinates → screen pixels (CSS px).
        const screenPoints: HeatPoint[] = heatPoints.map((p) => ({
          x: (p.x - vb.x) * scale,
          y: (p.y - vb.y) * scale,
          weight: p.weight,
        }))
        const radiusPx = Math.max(20, dr * scale)
        drawHeatLayer(
          ctx,
          rect.width,
          rect.height,
          heatCanvas.width,
          heatCanvas.height,
          screenPoints,
          maxWeight,
          radiusPx,
          gradientLut,
        )
      }

      redrawRef.current = redraw
      redraw()
      const onChange = () => redraw()
      eventBus.on("canvas.viewbox.changed", onChange)
      eventBus.on("canvas.resized", onChange)
      // Resize only repaints the overlay — the operator's pan/zoom is kept.
      const ro = new ResizeObserver(() => redraw())
      if (containerRef.current) ro.observe(containerRef.current)
      return () => {
        eventBus.off("canvas.viewbox.changed", onChange)
        eventBus.off("canvas.resized", onChange)
        ro.disconnect()
        redrawRef.current = null
      }
    },
  })

  // Repaint the overlay when the heat values change (toggle) — viewer stays mounted.
  useEffect(() => {
    redrawRef.current?.()
  }, [nodeFrequencies, edgeFrequencies, diagramRadius])

  // Mirrors the `weight > 0` filter in buildHeatPoints: a map of zeros paints
  // nothing, so it must read as "no data" too.
  const hasHeat =
    Object.values(nodeFrequencies).some((v) => v > 0) ||
    Object.values(edgeFrequencies).some((v) => v > 0)

  return (
    <div
      data-theme-mode="light"
      className="relative w-full"
      style={{ height: `${height ?? autoHeight}px` }}
    >
      <div
        ref={containerRef}
        role="img"
        aria-label={diagramAriaLabel}
        className="border-border absolute inset-0 size-full rounded-md border"
      />
      <canvas
        ref={heatCanvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full rounded-md"
        style={{ mixBlendMode: "multiply" }}
      />
      {importError ? (
        <div className="absolute inset-x-3 top-3">
          <ErrorState
            variant="inline"
            title={errorTitle}
            description={errorHint}
            details={importError}
          />
        </div>
      ) : (
        <>
          {hasHeat ? null : (
            <div
              role="status"
              className="border-border bg-card text-muted-foreground text-small shadow-1 pointer-events-none absolute top-3 left-3 rounded-sm border px-2 py-1"
            >
              {noHeatLabel}
            </div>
          )}
          <BpmnZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} onFit={fit} />
        </>
      )}
    </div>
  )
}

/**
 * The heat ramp's legend: the swatch (on the light paper, at the layer's
 * opacity, so it matches the diagram) between the smallest value above zero
 * and the largest (`min`/`max`, formatted by the caller) — or "Less"/"More"
 * where the values are not at hand. Screen readers hear the range as one
 * sentence ("1 to 1,234").
 */
export function HeatmapLegend({
  min,
  max,
  lessLabel = DEFAULT_HEATMAP_LABELS.less,
  moreLabel = DEFAULT_HEATMAP_LABELS.more,
}: {
  /** The smallest value above zero, formatted. */
  min?: string
  /** The largest value, formatted. */
  max?: string
  lessLabel?: string
  moreLabel?: string
}) {
  const labels = kitLabels(useLocale())
  const range = min !== undefined && max !== undefined
  const start = range ? min : lessLabel
  const end = range ? max : moreLabel
  return (
    <div className="text-small flex items-center gap-2">
      {range && <span className="sr-only">{labels.heatmapRange({ min, max })}</span>}
      <span aria-hidden={range || undefined} className="text-muted-foreground tabular-nums">
        {start}
      </span>
      <span
        aria-hidden="true"
        data-theme-mode="light"
        className="bg-background border-border inline-flex h-3 w-32 overflow-hidden rounded-sm border"
      >
        <span
          className="size-full"
          style={{ background: HEAT_GRADIENT_CSS, opacity: HEAT_PEAK_ALPHA }}
        />
      </span>
      <span aria-hidden={range || undefined} className="text-muted-foreground tabular-nums">
        {end}
      </span>
    </div>
  )
}
