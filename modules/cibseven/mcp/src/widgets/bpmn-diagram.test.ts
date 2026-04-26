import { describe, expect, it } from "vitest"
import { applyHighlights, dedupe } from "./bpmn-diagram.js"

interface MarkerCall {
  activityId: string
  marker: string
}

interface OverlayCall {
  activityId: string
  position: object
  className: string
}

function createMockCanvas() {
  const calls: MarkerCall[] = []
  return {
    canvas: {
      addMarker: (activityId: string, marker: string) => {
        calls.push({ activityId, marker })
      },
      // Stubs for the unused parts of the BpmnCanvas type — the apply
      // function never touches them, but the type requires them.
      zoom: () => 1,
    },
    calls,
  }
}

function createMockOverlays() {
  const calls: OverlayCall[] = []
  return {
    overlays: {
      add: (activityId: string, overlay: { position: object; html: string }) => {
        const match = /class="([^"]+)"/.exec(overlay.html)
        calls.push({
          activityId,
          position: overlay.position,
          className: match ? match[1] : "",
        })
      },
    },
    calls,
  }
}

describe("dedupe", () => {
  it("preserves first-seen order and drops duplicates", () => {
    expect(dedupe(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"])
  })

  it("returns an empty array for an empty input", () => {
    expect(dedupe([])).toEqual([])
  })
})

describe("applyHighlights — marker priority", () => {
  it("applies running marker to plain active activities only", () => {
    const c = createMockCanvas()
    const o = createMockOverlays()
    applyHighlights(c.canvas, o.overlays, [{ kind: "active", activityIds: ["A", "B"] }])
    expect(c.calls).toEqual([
      { activityId: "A", marker: "highlight-running" },
      { activityId: "B", marker: "highlight-running" },
    ])
  })

  it("incident wins over open-task and active for the same activity", () => {
    const c = createMockCanvas()
    const o = createMockOverlays()
    applyHighlights(c.canvas, o.overlays, [
      { kind: "active", activityIds: ["A"] },
      { kind: "open-task", tasks: [{ activityId: "A" }] },
      { kind: "incident", activityIds: ["A"] },
    ])
    // Only the incident marker is applied to A.
    expect(c.calls).toEqual([{ activityId: "A", marker: "highlight-incident" }])
  })

  it("open-task wins over active when no incident", () => {
    const c = createMockCanvas()
    const o = createMockOverlays()
    applyHighlights(c.canvas, o.overlays, [
      { kind: "active", activityIds: ["A"] },
      { kind: "open-task", tasks: [{ activityId: "A", label: "Decide" }] },
    ])
    expect(c.calls).toEqual([{ activityId: "A", marker: "highlight-open-user-task" }])
  })

  it("dedupes duplicate ids across multiple highlight entries of the same kind", () => {
    const c = createMockCanvas()
    const o = createMockOverlays()
    applyHighlights(c.canvas, o.overlays, [
      { kind: "active", activityIds: ["A", "A"] },
      { kind: "active", activityIds: ["A", "B"] },
    ])
    expect(c.calls.map((m) => m.activityId)).toEqual(["A", "B"])
  })
})

describe("applyHighlights — overlays", () => {
  it("adds open-task badge with the provided label", () => {
    const c = createMockCanvas()
    const o = createMockOverlays()
    applyHighlights(c.canvas, o.overlays, [
      { kind: "open-task", tasks: [{ activityId: "T", label: "Decide on application" }] },
    ])
    const overlay = o.calls.find((x) => x.className.includes("open-task"))
    expect(overlay).toBeDefined()
    expect(overlay?.activityId).toBe("T")
  })

  it("adds incident count overlay when counts are supplied", () => {
    const c = createMockCanvas()
    const o = createMockOverlays()
    applyHighlights(c.canvas, o.overlays, [
      {
        kind: "incident",
        activityIds: ["X"],
        counts: [{ activityId: "X", count: 3 }],
      },
    ])
    const overlay = o.calls.find((x) => x.className.includes("incident-count"))
    expect(overlay?.activityId).toBe("X")
  })

  it("adds failed-jobs count overlays separately from incident", () => {
    const c = createMockCanvas()
    const o = createMockOverlays()
    applyHighlights(c.canvas, o.overlays, [
      { kind: "failed-jobs", counts: [{ activityId: "Y", count: 2 }] },
    ])
    expect(o.calls).toHaveLength(1)
    expect(o.calls[0].className).toContain("incident-count")
    expect(o.calls[0].activityId).toBe("Y")
  })

  it("skips zero or negative count badges", () => {
    const c = createMockCanvas()
    const o = createMockOverlays()
    applyHighlights(c.canvas, o.overlays, [
      {
        kind: "instance-count",
        counts: [
          { activityId: "A", count: 0 },
          { activityId: "B", count: -1 },
          { activityId: "C", count: 5 },
        ],
      },
    ])
    expect(o.calls).toHaveLength(1)
    expect(o.calls[0].activityId).toBe("C")
  })

  it("escapes html in open-task labels", () => {
    const c = createMockCanvas()
    let captured = ""
    const overlays = {
      add: (_id: string, overlay: { position: object; html: string }) => {
        captured = overlay.html
      },
    }
    applyHighlights(c.canvas, overlays, [
      { kind: "open-task", tasks: [{ activityId: "T", label: '<script>alert("x")</script>' }] },
    ])
    expect(captured).not.toContain("<script>")
    expect(captured).toContain("&lt;script&gt;")
  })
})

describe("applyHighlights — error tolerance", () => {
  it("skips activities the canvas does not know about", () => {
    const calls: MarkerCall[] = []
    const canvas = {
      addMarker: (activityId: string, marker: string) => {
        if (activityId === "MISSING") throw new Error("not in diagram")
        calls.push({ activityId, marker })
      },
      zoom: () => 1,
    }
    const overlays = { add: () => {} }
    applyHighlights(canvas, overlays, [{ kind: "active", activityIds: ["A", "MISSING", "B"] }])
    expect(calls.map((c) => c.activityId)).toEqual(["A", "B"])
  })
})
