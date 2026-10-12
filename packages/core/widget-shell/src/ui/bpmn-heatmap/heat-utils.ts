import { BPMN_TOKENS, cdValue } from "../bpmn-tokens.js"

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
 * The faintest an element with a value above zero ever paints — the
 * smallest value's intensity — so a rarely taken path still shows instead
 * of fading to "never" (U16).
 */
export const MIN_HEAT_INTENSITY = 0.3

/**
 * An element's heat intensity: the range from the smallest value above zero
 * to the largest mapped LINEARLY onto {@link MIN_HEAT_INTENSITY}…1, so the
 * legend's ends ("1 … 1.000") are exactly the values its ends encode and its
 * middle the middle value. (A floor on `weight / max` instead painted
 * everything up to 30 % of the maximum like the minimum.) One value for all
 * elements paints at full intensity.
 */
export function heatIntensity(weight: number, range: { min: number; max: number }): number {
  if (!(range.max > range.min)) return 1
  const t = Math.max(0, Math.min(1, (weight - range.min) / (range.max - range.min)))
  return MIN_HEAT_INTENSITY + (1 - MIN_HEAT_INTENSITY) * t
}

/**
 * The heat layer's opacity at full intensity. Below 1 on purpose: the layer
 * multiplies over the diagram, and at 0.75 the darkest step (`--cd-blau`)
 * keeps a black task label above 4.5:1 (`heat-utils.test.ts`).
 */
export const HEAT_PEAK_ALPHA = 0.75

/** Intensity at which the opacity reaches its peak — the soft rim of a blob below it. */
const HEAT_RIM = 0.2

/** `#RRGGBB` → [r, g, b] (0–255). */
export function hexChannels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/**
 * The heat ramp (owner decision 2j): ONE hue from `--cd-info-soft` to
 * `--cd-blau`, never a rainbow and never red (red is for incidents). Colour
 * at intensity `t` (0–1) is the linear mix of the two tokens; the opacity
 * rises over the rim to {@link HEAT_PEAK_ALPHA}.
 */
export function heatColor(t: number): [number, number, number, number] {
  const clamped = Math.max(0, Math.min(1, t))
  const from = hexChannels(cdValue(BPMN_TOKENS.heat.from))
  const to = hexChannels(cdValue(BPMN_TOKENS.heat.to))
  const mix = (i: number) => Math.round(from[i] + (to[i] - from[i]) * clamped)
  const alpha = HEAT_PEAK_ALPHA * Math.min(1, clamped / HEAT_RIM)
  return [mix(0), mix(1), mix(2), Math.round(alpha * 255)]
}

/**
 * The ramp as a 256-entry RGBA table (index = the stamped alpha 0–255), so
 * the colorize pass maps a pixel in O(1). Pure: no canvas needed.
 */
export function buildGradientLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4)
  for (let i = 0; i < 256; i++) lut.set(heatColor(i / 255), i * 4)
  return lut
}

/**
 * The legend swatch of the ramp as CSS: from the faintest value above zero
 * ({@link MIN_HEAT_INTENSITY}) to full blue, through the same tokens. Paint it
 * at {@link HEAT_PEAK_ALPHA} opacity on the light paper and it matches the
 * diagram.
 */
export const HEAT_GRADIENT_CSS = `linear-gradient(to right, color-mix(in srgb, var(--cd-${BPMN_TOKENS.heat.to}) ${String(
  Math.round(MIN_HEAT_INTENSITY * 100),
)}%, var(--cd-${BPMN_TOKENS.heat.from})), var(--cd-${BPMN_TOKENS.heat.to}))`

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
      points.push(...sequenceFlowHeatPoints(el, bo, edgeFrequencies))
      continue
    }

    const point = nodeHeatPoint(el, bo.id, nodeFrequencies)
    if (point) points.push(point)
  }
  return points
}

/** Heat points sampled along a sequence flow's waypoint polyline. */
function sequenceFlowHeatPoints(
  el: BpmnElement,
  bo: BusinessObject,
  edgeFrequencies: Record<string, number>,
): HeatPoint[] {
  const srcId = bo.sourceRef?.id
  const tgtId = bo.targetRef?.id
  if (!srcId || !tgtId) return []
  const flow = edgeFrequencies[`${srcId}->${tgtId}`] ?? 0
  if (flow <= 0) return []
  const waypoints = el.waypoints
  if (!waypoints || waypoints.length < 2) return []
  const points: HeatPoint[] = []
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
  return points
}

/** Single heat point at a shape's center, or `null` when it carries no heat. */
function nodeHeatPoint(
  el: BpmnElement,
  id: string,
  nodeFrequencies: Record<string, number>,
): HeatPoint | null {
  const freq = nodeFrequencies[id]
  if (!freq || freq <= 0) return null
  if (el.x == null || el.y == null || el.width == null || el.height == null) return null
  return {
    x: el.x + el.width / 2,
    y: el.y + el.height / 2,
    weight: freq,
  }
}

export function drawHeatLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rawWidth: number,
  rawHeight: number,
  points: HeatPoint[],
  /** The smallest and largest weight of `points` (the legend's ends). */
  range: { min: number; max: number },
  radiusPx: number,
  gradientLut: Uint8ClampedArray,
) {
  ctx.clearRect(0, 0, width, height)
  if (points.length === 0 || range.max <= 0) return

  const blur = Math.max(8, radiusPx * 0.6)
  const brush = buildBrush(radiusPx, blur)
  const r2 = radiusPx + blur

  // Pass 1: stamp greyscale alpha (the element's intensity, heatIntensity).
  for (const p of points) {
    if (p.x < -r2 || p.y < -r2 || p.x > width + r2 || p.y > height + r2) continue
    ctx.globalAlpha = heatIntensity(p.weight, range)
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

/** The smallest value above zero and the largest, or null when nothing is above zero. */
export function heatRange(values: Record<string, number>): { min: number; max: number } | null {
  return weightRange(Object.values(values))
}

/** {@link heatRange} over plain weights (the drawn heat points). */
export function weightRange(weights: readonly number[]): { min: number; max: number } | null {
  let min = Infinity
  let max = -Infinity
  for (const w of weights) {
    if (!Number.isFinite(w) || w <= 0) continue
    if (w < min) min = w
    if (w > max) max = w
  }
  return max > 0 ? { min, max } : null
}

/**
 * The names the diagram gives its elements (`name` attribute), keyed by id —
 * so a values table can say "Antrag prüfen" instead of `Activity_1x2y`. An
 * unparsable document gives no names (the table falls back to the ids).
 */
export function bpmnElementNames(xml: string): Record<string, string> {
  const names: Record<string, string> = {}
  const doc = parseBpmn(xml)
  if (!doc) return names
  for (const el of Array.from(doc.querySelectorAll("[id][name]"))) {
    const name = el.getAttribute("name")?.trim()
    const id = el.getAttribute("id")
    if (id && name) names[id] = name
  }
  return names
}

/**
 * The name of the process `processDefinitionKey` by the rule the server
 * names it in every analytics view (analytics' `parseBpmnNames`): the
 * process's own name, else the name of the pool that holds it
 * (`<participant processRef=key>`: a collaboration from the Camunda Modeler
 * names the pool and leaves the process unnamed), else null. Any namespace
 * prefix; line breaks and runs of space folded.
 */
export function bpmnProcessName(xml: string, processDefinitionKey: string): string | null {
  const doc = parseBpmn(xml)
  if (!doc) return null
  let processName: string | null = null
  let poolName: string | null = null
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    const name = el.getAttribute("name")?.replace(/\s+/g, " ").trim()
    if (!name) continue
    if (el.localName === "process" && el.getAttribute("id") === processDefinitionKey) {
      processName ??= name
    } else if (
      el.localName === "participant" &&
      el.getAttribute("processRef") === processDefinitionKey
    ) {
      poolName ??= name
    }
  }
  return processName ?? poolName
}

/** The diagram as an XML document, or null when it does not parse. */
function parseBpmn(xml: string): Document | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml")
  return doc.getElementsByTagName("parsererror").length > 0 ? null : doc
}
