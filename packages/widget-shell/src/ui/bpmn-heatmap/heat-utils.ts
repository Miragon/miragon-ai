/**
 * Pure helpers for the BPMN heatmap canvas: gradient LUT, brush stamp,
 * heat-point projection and the two-pass colorize draw. Kept free of React
 * and viewer state so the math is testable and the widget shell stays small.
 */

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

export interface BpmnElement {
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

export interface HeatPoint {
  x: number
  y: number
  weight: number
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

/**
 * Cockpit-style heat gradient stops (transparent → green → yellow → orange →
 * red), as `[offset, rgba]` tuples. Single source of truth shared by the canvas
 * LUT ({@link buildGradientLut}) and the widget's CSS legend swatch, so the two
 * never drift. These are intentionally explicit RGBA values (not theme tokens):
 * a heat ramp needs fixed hue/luminance steps, and the colors read in both
 * light and dark mode because the overlay composites with `mix-blend-mode`.
 */
export const HEAT_GRADIENT_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0.0, "rgba(0, 0, 255, 0)"],
  [0.25, "rgba(0, 200, 80, 0.85)"],
  [0.5, "rgba(255, 230, 0, 0.9)"],
  [0.75, "rgba(255, 140, 0, 0.95)"],
  [1.0, "rgba(220, 30, 30, 1)"],
]

/** CSS `linear-gradient(...)` color list derived from {@link HEAT_GRADIENT_STOPS}. */
export const HEAT_GRADIENT_CSS = `linear-gradient(to right, ${HEAT_GRADIENT_STOPS.map(
  ([, color]) => color,
).join(", ")})`

/**
 * The heat gradient pre-rendered to a 256-row image so we can map alpha
 * (0-255) → RGB in O(1) during the colorize pass.
 */
export function buildGradientLut(): Uint8ClampedArray {
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 256
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2D canvas context unavailable")
  const grad = ctx.createLinearGradient(0, 0, 0, 256)
  for (const [offset, color] of HEAT_GRADIENT_STOPS) {
    grad.addColorStop(offset, color)
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 1, 256)
  return ctx.getImageData(0, 0, 1, 256).data
}

/** Soft radial brush stamp; one draw per heat point. */
export function buildBrush(radius: number, blur: number): HTMLCanvasElement {
  const r2 = radius + blur
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = r2 * 2
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2D canvas context unavailable")
  ctx.shadowOffsetX = ctx.shadowOffsetY = r2 * 2
  ctx.shadowBlur = blur
  ctx.shadowColor = "black"
  ctx.beginPath()
  ctx.arc(-r2, -r2, radius, 0, Math.PI * 2, true)
  ctx.closePath()
  ctx.fill()
  return canvas
}

export function buildHeatPoints(
  elements: BpmnElement[],
  nodeFrequencies: Record<string, number>,
  edgeFrequencies: Record<string, number>,
): HeatPoint[] {
  const points: HeatPoint[] = []
  for (const el of elements) {
    // Skip label elements — they share their target's businessObject id and
    // would otherwise stamp a second heat blob over the activity's text.
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

export function drawHeatLayer(
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

  // Pass 1: stamp greyscale alpha (intensity = weight / max).
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
