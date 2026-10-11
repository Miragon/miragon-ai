// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import { CD_TOKENS } from "@miragon/mcp-toolkit-ui"
import { composite, contrastRatio, type Rgba } from "../../testing/index.js"
import {
  bpmnElementNames,
  buildGradientLut,
  drawHeatLayer,
  HEAT_GRADIENT_CSS,
  HEAT_PEAK_ALPHA,
  heatColor,
  heatRange,
  hexChannels,
  MIN_HEAT_INTENSITY,
} from "./heat-utils.js"

const rgba = ([r, g, b, a]: readonly number[]): Rgba => ({
  r: r / 255,
  g: g / 255,
  b: b / 255,
  a: a / 255,
})
const hex = (value: string): Rgba => rgba([...hexChannels(value), 255])
const WHITE = hex(CD_TOKENS.weiss)

describe("the heat ramp (owner decision 2j: one hue, --cd-info-soft to --cd-blau)", () => {
  it("starts on the info tint and ends on full blue", () => {
    expect(heatColor(0).slice(0, 3)).toEqual(hexChannels(CD_TOKENS["info-soft"]))
    expect(heatColor(1).slice(0, 3)).toEqual(hexChannels(CD_TOKENS.blau))
    // Out-of-range intensities clamp.
    expect(heatColor(-1)).toEqual(heatColor(0))
    expect(heatColor(2)).toEqual(heatColor(1))
  })

  it("never turns red: every step is bluer than it is red (red is for incidents)", () => {
    for (let i = 0; i <= 10; i++) {
      const [r, , b] = heatColor(i / 10)
      expect(b).toBeGreaterThan(r)
    }
  })

  it("fades in over the rim, then holds the peak opacity", () => {
    expect(heatColor(0)[3]).toBe(0)
    expect(heatColor(0.1)[3]).toBe(Math.round(HEAT_PEAK_ALPHA * 0.5 * 255))
    expect(heatColor(0.2)[3]).toBe(Math.round(HEAT_PEAK_ALPHA * 255))
    expect(heatColor(1)[3]).toBe(Math.round(HEAT_PEAK_ALPHA * 255))
  })

  it("is a 256-step RGBA table the colorize pass indexes by alpha", () => {
    const lut = buildGradientLut()
    expect(lut).toHaveLength(256 * 4)
    expect([...lut.slice(0, 4)]).toEqual(heatColor(0))
    expect([...lut.slice(255 * 4)]).toEqual(heatColor(1))
  })

  it("the faintest value above zero still shows on the paper (U16)", () => {
    const faintest = composite(rgba(heatColor(MIN_HEAT_INTENSITY)), WHITE)
    expect(contrastRatio(faintest, WHITE)).toBeGreaterThan(1.3)
  })

  it("keeps a black task label readable under the strongest heat (4.5:1)", () => {
    const strongest = composite(rgba(heatColor(1)), WHITE)
    expect(contrastRatio(hex(CD_TOKENS.schwarz), strongest)).toBeGreaterThanOrEqual(4.5)
  })

  it("draws its legend from the same tokens, starting at the minimum intensity", () => {
    expect(HEAT_GRADIENT_CSS).toBe(
      "linear-gradient(to right, color-mix(in srgb, var(--cd-blau) 30%, var(--cd-info-soft)), var(--cd-blau))",
    )
  })
})

describe("drawHeatLayer", () => {
  function recordingContext() {
    const alphas: number[] = []
    const ctx = {
      globalAlpha: 1,
      clearRect: () => {},
      drawImage() {
        alphas.push(ctx.globalAlpha)
      },
      getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0]) }),
      putImageData: () => {},
    }
    return { ctx, alphas }
  }

  it("stamps every element with a value at the minimum intensity or more", () => {
    const { ctx, alphas } = recordingContext()
    // The brush is a canvas of its own; a stub stands in for happy-dom's.
    const brush = {
      width: 10,
      height: 10,
      getContext: () => ({ arc() {}, beginPath() {}, closePath() {}, fill() {} }),
    }
    const original = document.createElement.bind(document)
    const spy = (tag: string): unknown => (tag === "canvas" ? brush : original(tag))
    document.createElement = spy as typeof document.createElement
    try {
      drawHeatLayer(
        ctx as unknown as CanvasRenderingContext2D,
        100,
        100,
        100,
        100,
        [
          { x: 10, y: 10, weight: 1 },
          { x: 50, y: 50, weight: 1000 },
        ],
        1000,
        20,
        buildGradientLut(),
      )
    } finally {
      document.createElement = original
    }
    expect(alphas).toEqual([MIN_HEAT_INTENSITY, 1])
  })
})

describe("bpmnElementNames", () => {
  it("reads the names the diagram gives its elements, by id", () => {
    const xml = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d">
  <bpmn:process id="invoice" name="Invoice Receipt">
    <bpmn:userTask id="approve" name=" Approve invoice " />
    <bpmn:serviceTask id="archive" />
    <bpmn:endEvent id="done" name="" />
  </bpmn:process>
</bpmn:definitions>`
    expect(bpmnElementNames(xml)).toEqual({
      invoice: "Invoice Receipt",
      approve: "Approve invoice",
    })
  })

  it("gives no names for a document it cannot parse", () => {
    expect(bpmnElementNames("<not xml")).toEqual({})
  })
})

describe("heatRange", () => {
  it("is the smallest value above zero and the largest", () => {
    expect(heatRange({ a: 0, b: 3, c: 12, d: -1, e: Number.NaN })).toEqual({ min: 3, max: 12 })
  })

  it("is null when nothing is above zero", () => {
    expect(heatRange({ a: 0 })).toBeNull()
    expect(heatRange({})).toBeNull()
  })
})
