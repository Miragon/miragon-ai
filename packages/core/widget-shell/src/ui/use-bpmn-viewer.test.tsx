// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { useBpmnViewer } from "./use-bpmn-viewer.js"

// bpmn-js needs a real SVG engine, which happy-dom does not provide — a
// recording stub stands in. (The full lifecycle suite runs in the camunda7
// connector, through the widgets' entry point; this one pins what the hook
// itself owns for EVERY consumer: the canvas.)
const mock = vi.hoisted(() => {
  class MockViewer {
    static containers: HTMLElement[] = []
    constructor(opts: { container: HTMLElement }) {
      MockViewer.containers.push(opts.container)
    }
    importXML(): Promise<{ warnings: string[] }> {
      return Promise.resolve({ warnings: [] })
    }
    get(): unknown {
      return { zoom: () => 1 }
    }
    destroy() {}
  }
  return { MockViewer }
})

vi.mock("bpmn-js/lib/NavigatedViewer", () => ({ default: mock.MockViewer }))

const XML = "<bpmn:definitions/>"

/**
 * A widget that only attaches the ref — no canvas class, and a themed card
 * background on the container, the way a new BPMN widget would start out.
 */
function Diagram({
  xml,
  element = "a",
  loading = false,
}: {
  xml: string
  element?: string
  /** Still loading: the container is not rendered, the ref stays unattached. */
  loading?: boolean
}) {
  const { containerRef } = useBpmnViewer({ bpmnXml: xml })
  if (loading) return <p>Loading…</p>
  return <div key={element} ref={containerRef} className="bg-card" data-testid="canvas" />
}

const canvas = () => screen.getByTestId("canvas")

function expectLightCanvas(el: HTMLElement) {
  expect(el.style.getPropertyValue("background-color")).toBe("#fff")
  expect(el.style.getPropertyValue("color-scheme")).toBe("light")
}

afterEach(() => {
  cleanup()
  mock.MockViewer.containers.length = 0
  document.documentElement.classList.remove("dark")
})

describe("useBpmnViewer canvas (#339, N122)", () => {
  it("paints the container as the fixed light canvas in a dark document — no call site opts in", async () => {
    document.documentElement.classList.add("dark")
    render(<Diagram xml={XML} />)

    await waitFor(() => expect(mock.MockViewer.containers).toEqual([canvas()]))
    expectLightCanvas(canvas())
  })

  it("paints before any viewer exists, and again when the ref moves to a new element", () => {
    const { rerender } = render(<Diagram xml="" />)
    // No XML yet, so no viewer — the canvas is light from the first paint.
    expect(mock.MockViewer.containers).toEqual([])
    const first = canvas()
    expectLightCanvas(first)

    rerender(<Diagram xml="" element="b" />)
    expect(canvas()).not.toBe(first)
    expectLightCanvas(canvas())
  })

  it("waits for a container a loading widget has not rendered yet", () => {
    const { rerender } = render(<Diagram xml={XML} loading />)
    expect(screen.queryByTestId("canvas")).toBeNull()

    rerender(<Diagram xml={XML} />)
    expectLightCanvas(canvas())
  })
})
