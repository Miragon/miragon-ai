import { useEffect, useRef, useState } from "react"
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer"
import { Alert, AlertDescription, Badge, Button, Card, CardContent } from "@miragon/mcp-toolkit-ui"
import {
  buildGradientLut,
  buildHeatPoints,
  drawHeatLayer,
  type BpmnElement,
  type HeatPoint,
} from "./bpmn-heatmap/heat-utils.js"
import { HeatmapZoomControls } from "./bpmn-heatmap/zoom-controls.js"

interface BpmnCanvas {
  zoom(mode: "fit-viewport"): void
  zoom(level: number): void
  zoom(): number
  viewbox(): { x: number; y: number; width: number; height: number; scale: number }
  getContainer(): HTMLElement
}

interface ElementRegistry {
  getAll: () => BpmnElement[]
}

interface EventBus {
  on: (event: string, fn: () => void) => void
  off: (event: string, fn: () => void) => void
}

interface BpmnViewerWithGet {
  get: ((service: "canvas") => BpmnCanvas) &
    ((service: "elementRegistry") => ElementRegistry) &
    ((service: "eventBus") => EventBus)
}

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
  const containerRef = useRef<HTMLDivElement>(null)
  const heatCanvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<NavigatedViewer | null>(null)
  const redrawRef = useRef<(() => void) | null>(null)
  // Latest heat inputs, read by redraw() so we can repaint without re-importing.
  const dataRef = useRef({ nodeFrequencies, edgeFrequencies, diagramRadius })
  dataRef.current = { nodeFrequencies, edgeFrequencies, diagramRadius }

  useEffect(() => {
    if (!containerRef.current || !bpmnXml) return

    const viewer = new NavigatedViewer({ container: containerRef.current })
    viewerRef.current = viewer
    let cancelled = false
    let cleanupRedraw: (() => void) | null = null
    const gradientLut = buildGradientLut()

    void viewer.importXML(bpmnXml).then(() => {
      if (cancelled) return
      const bpmn = viewer as unknown as BpmnViewerWithGet
      const canvas = bpmn.get("canvas")
      canvas.zoom("fit-viewport")
      canvas.zoom(canvas.zoom() * 0.95)

      const elementRegistry = bpmn.get("elementRegistry")
      const eventBus = bpmn.get("eventBus")

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
      const ro = new ResizeObserver(() => redraw())
      ro.observe(containerRef.current)
      cleanupRedraw = () => {
        eventBus.off("canvas.viewbox.changed", onChange)
        eventBus.off("canvas.resized", onChange)
        ro.disconnect()
        redrawRef.current = null
      }
    })

    return () => {
      cancelled = true
      cleanupRedraw?.()
      viewerRef.current = null
      viewer.destroy()
    }
  }, [bpmnXml])

  // Repaint the overlay when the heat values change (toggle) — viewer stays mounted.
  useEffect(() => {
    redrawRef.current?.()
  }, [nodeFrequencies, edgeFrequencies, diagramRadius])

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
    <div className="relative" style={{ height: `${height}px`, width: "100%" }}>
      <div
        ref={containerRef}
        className="border-border absolute inset-0 rounded-lg border"
        style={{ width: "100%", height: "100%" }}
      />
      <canvas
        ref={heatCanvasRef}
        className="pointer-events-none absolute inset-0 rounded-lg"
        style={{ mixBlendMode: "multiply", width: "100%", height: "100%" }}
      />
      <HeatmapZoomControls onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} onFit={handleFit} />
    </div>
  )
}

export function HeatmapLegend() {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Less</span>
      <div
        className="h-3 w-32 rounded"
        style={{
          background:
            "linear-gradient(to right, rgba(0,0,255,0), rgba(0,200,80,0.85), rgba(255,230,0,0.9), rgba(255,140,0,0.95), rgba(220,30,30,1))",
        }}
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
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <strong>BPMN heatmap</strong>
          <Badge>{data.processDefinitionKey}</Badge>
          <Badge variant="outline">window: {data.period}</Badge>
          <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
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

        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span className="text-muted-foreground text-xs">{legendLabel}</span>
          <HeatmapLegend />
        </div>
      </CardContent>
    </Card>
  )
}
