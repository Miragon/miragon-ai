import { useEffect, useRef, useState } from "react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
} from "@miragon/mcp-toolkit-ui"
import {
  buildGradientLut,
  buildHeatPoints,
  drawHeatLayer,
  HEAT_GRADIENT_CSS,
  type HeatPoint,
} from "./bpmn-heatmap/heat-utils.js"
import { BpmnZoomControls } from "./bpmn-zoom-controls.js"
import { useBpmnViewer } from "./use-bpmn-viewer.js"

export interface BpmnHeatmapProps {
  bpmnXml: string
  /** Per-element heat value keyed by BPMN element id (frequency or duration). */
  nodeFrequencies: Record<string, number>
  /** Per-edge value keyed by `${sourceId}->${targetId}`. Metrics carry none → `{}`. */
  edgeFrequencies?: Record<string, number>
  height?: number
  /** Heat radius in diagram coordinates. Scales with zoom. */
  diagramRadius?: number
}

/**
 * Renders a BPMN diagram (bpmn-js NavigatedViewer) with a Cockpit-style heat
 * overlay on a canvas synced to the viewbox. The viewer mounts once per diagram
 * (`bpmnXml`); changing `nodeFrequencies` (e.g. the frequency↔duration toggle)
 * only repaints the overlay — no re-import / refit.
 */
export function BpmnHeatmap({
  bpmnXml,
  nodeFrequencies,
  edgeFrequencies = {},
  height = 480,
  diagramRadius = 55,
}: BpmnHeatmapProps) {
  const heatCanvasRef = useRef<HTMLCanvasElement>(null)
  const redrawRef = useRef<(() => void) | null>(null)
  // Latest heat inputs, read by redraw() so we can repaint without re-importing.
  const dataRef = useRef({ nodeFrequencies, edgeFrequencies, diagramRadius })
  dataRef.current = { nodeFrequencies, edgeFrequencies, diagramRadius }

  const { containerRef, importError, zoomIn, zoomOut, fit } = useBpmnViewer({
    bpmnXml,
    onImported: (viewer) => {
      const gradientLut = buildGradientLut()
      const canvas = viewer.get("canvas")
      const elementRegistry = viewer.get("elementRegistry")
      const eventBus = viewer.get("eventBus")

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

  return (
    <div className="relative w-full" style={{ height: `${height}px` }}>
      <div
        ref={containerRef}
        role="img"
        aria-label="BPMN process diagram with an execution heat overlay"
        className="border-border absolute inset-0 size-full rounded-lg border"
      />
      <canvas
        ref={heatCanvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full rounded-lg"
        style={{ mixBlendMode: "multiply" }}
      />
      {importError ? (
        <Alert className="absolute inset-x-3 top-3">
          <AlertTitle>Diagram could not be rendered</AlertTitle>
          <AlertDescription>{importError}</AlertDescription>
        </Alert>
      ) : (
        <BpmnZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} onFit={fit} />
      )}
    </div>
  )
}

export function HeatmapLegend() {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Less</span>
      <div
        aria-hidden="true"
        className="h-3 w-32 rounded"
        style={{ background: HEAT_GRADIENT_CSS }}
      />
      <span className="text-muted-foreground">More</span>
    </div>
  )
}

export interface BpmnHeatmapData {
  processDefinitionKey: string
  bpmnXml: string | null
  period: string
  /** Per-element execution count over the window, keyed by activity id. */
  frequency: Record<string, number>
  /** Per-element average duration in seconds over the window, keyed by activity id. */
  durationSec: Record<string, number>
}

type Mode = "frequency" | "duration"

/**
 * Data-widget wrapper: one BPMN diagram, a Frequency↔Duration toggle that swaps
 * the per-element heat values (both fetched up front). Node-only — metrics carry
 * no per-instance path data, so sequence flows are not heated.
 */
export function BpmnHeatmapWidget({ data }: { data: BpmnHeatmapData | null }) {
  const [mode, setMode] = useState<Mode>("frequency")

  if (!data) {
    return (
      <Alert>
        <AlertDescription>No heatmap data.</AlertDescription>
      </Alert>
    )
  }
  if (!data.bpmnXml) {
    return (
      <Alert>
        <AlertDescription>
          BPMN diagram unavailable — the analytics module has no camunda7 client configured to fetch
          it.
        </AlertDescription>
      </Alert>
    )
  }

  const values = mode === "frequency" ? data.frequency : data.durationSec
  const legendLabel =
    mode === "frequency" ? "Executions per element" : "Avg duration per element (s)"

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <strong>BPMN heatmap</strong>
          <Badge>{data.processDefinitionKey}</Badge>
          <Badge variant="outline">window: {data.period}</Badge>
          <div className="ml-auto flex gap-1">
            <Button
              size="sm"
              variant={mode === "frequency" ? "default" : "outline"}
              onClick={() => setMode("frequency")}
            >
              Frequency
            </Button>
            <Button
              size="sm"
              variant={mode === "duration" ? "default" : "outline"}
              onClick={() => setMode("duration")}
            >
              Duration
            </Button>
          </div>
        </div>

        <BpmnHeatmap bpmnXml={data.bpmnXml} nodeFrequencies={values} />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground text-xs">{legendLabel}</span>
          <HeatmapLegend />
        </div>
      </CardContent>
    </Card>
  )
}
