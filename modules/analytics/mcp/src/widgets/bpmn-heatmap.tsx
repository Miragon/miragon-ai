import { useEffect, useRef } from "react"
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer"

interface BpmnCanvas {
  zoom(mode: "fit-viewport"): void
  zoom(level: number): void
  zoom(): number
  viewbox(): { x: number; y: number; width: number; height: number; scale: number }
  getContainer(): HTMLElement
}

interface BusinessObject {
  id?: string
  $type?: string
  sourceRef?: { id?: string }
  targetRef?: { id?: string }
}

interface Waypoint {
  x: number
  y: number
}

interface BpmnElement {
  id: string
  type?: string
  x?: number
  y?: number
  width?: number
  height?: number
  waypoints?: Waypoint[]
  businessObject?: BusinessObject
  /** Set on label elements; points back at the shape they label. */
  labelTarget?: BpmnElement
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

/**
 * Heat color gradient (Cockpit-style): transparent → green → yellow → red.
 * Pre-rendered into a 256-row image so we can map an alpha value (0-255) to
 * an RGB color in O(1) during the colorize pass.
 */
function buildGradientLut(): Uint8ClampedArray {
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 256
  const ctx = canvas.getContext("2d")
  const grad = ctx.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0.0, "rgba(0, 0, 255, 0)")
  grad.addColorStop(0.25, "rgba(0, 200, 80, 0.85)")
  grad.addColorStop(0.5, "rgba(255, 230, 0, 0.9)")
  grad.addColorStop(0.75, "rgba(255, 140, 0, 0.95)")
  grad.addColorStop(1.0, "rgba(220, 30, 30, 1)")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 1, 256)
  return ctx.getImageData(0, 0, 1, 256).data
}

/** Pre-render a soft radial brush stamp; one draw per heat point keeps the
 * intensity layer cheap regardless of point count. */
function buildBrush(radius: number, blur: number): HTMLCanvasElement {
  const r2 = radius + blur
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = r2 * 2
  const ctx = canvas.getContext("2d")
  ctx.shadowOffsetX = ctx.shadowOffsetY = r2 * 2
  ctx.shadowBlur = blur
  ctx.shadowColor = "black"
  ctx.beginPath()
  ctx.arc(-r2, -r2, radius, 0, Math.PI * 2, true)
  ctx.closePath()
  ctx.fill()
  return canvas
}

interface HeatPoint {
  x: number
  y: number
  weight: number
}

function drawHeatLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rawWidth: number,
  rawHeight: number,
  points: HeatPoint[],
  maxWeight: number,
  radiusPx: number,
  gradientLut: Uint8ClampedArray,
) {
  ctx.clearRect(0, 0, width, height)
  if (points.length === 0 || maxWeight <= 0) return

  const blur = Math.max(8, radiusPx * 0.6)
  const brush = buildBrush(radiusPx, blur)
  const r2 = radiusPx + blur

  // Pass 1: stamp greyscale alpha for every point. Strength = weight / max.
  for (const p of points) {
    if (p.x < -r2 || p.y < -r2 || p.x > width + r2 || p.y > height + r2) continue
    const intensity = Math.max(0.05, Math.min(1, p.weight / maxWeight))
    ctx.globalAlpha = intensity
    ctx.drawImage(brush, p.x - r2, p.y - r2)
  }
  ctx.globalAlpha = 1

  // Pass 2: colorize the alpha channel through the gradient LUT. getImageData
  // operates in raw backing-store pixels and ignores the dpr transform, so we
  // must use the canvas's raw dimensions or only the top-left CSS-sized
  // quadrant gets colorized on retina displays.
  const img = ctx.getImageData(0, 0, rawWidth, rawHeight)
  const data = img.data
  for (let i = 0, n = data.length; i < n; i += 4) {
    const a = data[i + 3]
    if (a === 0) continue
    const j = a * 4
    data[i] = gradientLut[j]
    data[i + 1] = gradientLut[j + 1]
    data[i + 2] = gradientLut[j + 2]
    data[i + 3] = gradientLut[j + 3]
  }
  ctx.putImageData(img, 0, 0)
}

export interface BpmnHeatmapProps {
  bpmnXml: string
  /** Per-activity flow count keyed by activity (BPMN element) ID. */
  nodeFrequencies: Record<string, number>
  /** Per-edge flow count keyed by `${sourceId}->${targetId}`. */
  edgeFrequencies: Record<string, number>
  height?: number
  /** Heat radius in diagram coordinates. Scales with zoom. */
  diagramRadius?: number
}

const SKIP_TYPES = new Set([
  "bpmn:Process",
  "bpmn:Collaboration",
  "bpmn:Participant",
  "bpmn:Lane",
  "bpmn:LaneSet",
  "bpmn:TextAnnotation",
  "bpmn:Association",
  "bpmn:Group",
])

function buildHeatPoints(
  elements: BpmnElement[],
  nodeFrequencies: Record<string, number>,
  edgeFrequencies: Record<string, number>,
): HeatPoint[] {
  const points: HeatPoint[] = []
  for (const el of elements) {
    // Skip label elements — they share their target shape's businessObject id
    // and would otherwise stamp a second heat blob over the activity's text.
    if (el.type === "label" || el.labelTarget) continue
    const bo = el.businessObject
    const type = bo?.$type
    if (!bo?.id || !type) continue
    if (SKIP_TYPES.has(type)) continue

    if (type === "bpmn:SequenceFlow") {
      const srcId = bo.sourceRef?.id
      const tgtId = bo.targetRef?.id
      if (!srcId || !tgtId) continue
      const flow = edgeFrequencies[`${srcId}->${tgtId}`] ?? 0
      if (flow <= 0) continue
      const waypoints = el.waypoints
      if (!waypoints || waypoints.length < 2) continue
      // Sample points along each segment so the heat traces the connection.
      for (let i = 0; i < waypoints.length - 1; i++) {
        const a = waypoints[i]
        const b = waypoints[i + 1]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len = Math.hypot(dx, dy)
        const segments = Math.max(2, Math.ceil(len / 30))
        for (let s = 0; s <= segments; s++) {
          const t = s / segments
          points.push({ x: a.x + dx * t, y: a.y + dy * t, weight: flow })
        }
      }
      continue
    }

    const freq = nodeFrequencies[bo.id]
    if (!freq || freq <= 0) continue
    if (el.x == null || el.y == null || el.width == null || el.height == null) continue
    points.push({
      x: el.x + el.width / 2,
      y: el.y + el.height / 2,
      weight: freq,
    })
  }
  return points
}

export function BpmnHeatmap({
  bpmnXml,
  nodeFrequencies,
  edgeFrequencies,
  height = 480,
  diagramRadius = 55,
}: BpmnHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const heatCanvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<NavigatedViewer | null>(null)

  useEffect(() => {
    if (!containerRef.current || !bpmnXml) return

    const viewer = new NavigatedViewer({ container: containerRef.current })
    viewerRef.current = viewer
    let cancelled = false
    let cleanupRedraw: (() => void) | null = null

    void viewer.importXML(bpmnXml).then(() => {
      if (cancelled) return
      const bpmn = viewer as unknown as BpmnViewerWithGet
      const canvas = bpmn.get("canvas")
      canvas.zoom("fit-viewport")
      canvas.zoom(canvas.zoom() * 0.95)

      const elementRegistry = bpmn.get("elementRegistry")
      const eventBus = bpmn.get("eventBus")
      const heatPoints = buildHeatPoints(elementRegistry.getAll(), nodeFrequencies, edgeFrequencies)
      const maxWeight = heatPoints.reduce((m, p) => (p.weight > m ? p.weight : m), 0)
      const gradientLut = buildGradientLut()

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

        const vb = canvas.viewbox()
        const scale = vb.scale
        // Project diagram coordinates → screen pixels (CSS px).
        const screenPoints: HeatPoint[] = heatPoints.map((p) => ({
          x: (p.x - vb.x) * scale,
          y: (p.y - vb.y) * scale,
          weight: p.weight,
        }))
        const radiusPx = Math.max(20, diagramRadius * scale)
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
      }
    })

    return () => {
      cancelled = true
      cleanupRedraw?.()
      viewerRef.current = null
      viewer.destroy()
    }
  }, [bpmnXml, nodeFrequencies, edgeFrequencies, diagramRadius])

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
        style={{
          mixBlendMode: "multiply",
          width: "100%",
          height: "100%",
        }}
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
