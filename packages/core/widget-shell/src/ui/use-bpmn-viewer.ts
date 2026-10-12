import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer"
import { type BpmnElement } from "./bpmn-heatmap/heat-utils.js"
import { BPMN_TOKENS, cdVar } from "./bpmn-tokens.js"
import { useInlineBudget } from "./inline-budget.js"

/**
 * Structural typings for the bpmn-js services the widgets touch. bpmn-js ships
 * no usable types on `Viewer#get`, so the slice the widgets rely on is declared
 * once, here — a superset shared by the plain diagram (markers/overlays) and
 * the heatmap (viewbox/element registry/event bus).
 */
export interface BpmnCanvas {
  /** Fit the diagram into the viewport; `"auto"` centres it. Never zooms in past 1:1. */
  zoom(mode: "fit-viewport", center?: "auto"): void
  zoom(level: number): void
  zoom(): number
  addMarker(elementId: string, marker: string): void
  viewbox(): {
    x: number
    y: number
    width: number
    height: number
    scale: number
    /** The diagram's own bounds, in diagram units. */
    inner?: { x: number; y: number; width: number; height: number }
  }
  getContainer(): HTMLElement
  /**
   * Drop the cached viewbox. diagram-js caches it, the container's size
   * (`outer`) included, and only recomputes it after this call — a fit after
   * the frame changed size would otherwise scale against the old size.
   */
  resized(): void
}

export interface BpmnOverlays {
  add: (elementId: string, overlay: { position: object; html: string }) => void
}

export interface BpmnElementRegistry {
  getAll: () => BpmnElement[]
}

export interface BpmnEventBus {
  on: (event: string, fn: () => void) => void
  off: (event: string, fn: () => void) => void
}

export interface BpmnViewerWithGet {
  get: ((service: "canvas") => BpmnCanvas) &
    ((service: "overlays") => BpmnOverlays) &
    ((service: "elementRegistry") => BpmnElementRegistry) &
    ((service: "eventBus") => BpmnEventBus)
}

/**
 * Paint the canvas every BPMN widget renders on: a fixed LIGHT surface in both
 * themes (modeler-tool-design §10: the paper stays light), like Camunda
 * Cockpit. bpmn-js paints near-black strokes and labels and white fills
 * straight into the SVG; on the dark card those sequence flows and external
 * labels were unreadable, and a light canvas also keeps the overlay tints
 * (`BPMN_TOKENS`) and the heatmap's multiply blend exactly as designed. The
 * container becomes a forced-light island (`data-theme-mode="light"`), so
 * anything themed inside it renders light too, and takes the paper token
 * inline, so it beats any themed background class a widget puts on it — the
 * hook owns the canvas, no call site opts in.
 */
function paintLightCanvas(container: HTMLElement): void {
  container.setAttribute("data-theme-mode", "light")
  container.style.setProperty("background-color", cdVar(BPMN_TOKENS.paper))
  container.style.setProperty("color-scheme", "light")
}

/** The diagram frame's height range (U20): never a sliver, never taller than a screenful. */
export const DIAGRAM_MIN_HEIGHT = 240
export const DIAGRAM_MAX_HEIGHT = 560
/** Before the diagram's size and the container's width are known. */
export const DIAGRAM_DEFAULT_HEIGHT = 360
/** Room above and below the fitted diagram: the fit's 0.95 margin plus the zoom bar's reach. */
const DIAGRAM_HEIGHT_PADDING = 48

/** A diagram's extent in diagram units (bpmn-js draws one unit as one pixel at 1:1). */
export interface DiagramBounds {
  width: number
  height: number
}

/**
 * The frame height that shows a diagram whole at the container's width, at
 * the scale bpmn-js actually draws it: `fit-viewport` shrinks a diagram wider
 * than the container to its width but never zooms one in past 1:1, so a
 * small diagram keeps its natural size and gets a frame just as tall. Plus
 * room for the fit's margin and the zoom bar, clamped to
 * {@link DIAGRAM_MIN_HEIGHT}–{@link DIAGRAM_MAX_HEIGHT}: a wide, flat process
 * gets a low frame instead of a fixed 400 px with half of it empty; a tall
 * one stops at a screenful and stays pannable.
 */
export function diagramHeight(bounds: DiagramBounds | null, width: number): number {
  if (!bounds || !(bounds.width > 0) || !(bounds.height > 0) || !(width > 0)) {
    return DIAGRAM_DEFAULT_HEIGHT
  }
  const scale = Math.min(1, width / bounds.width)
  const fitted = Math.ceil(bounds.height * scale) + DIAGRAM_HEIGHT_PADDING
  return Math.min(DIAGRAM_MAX_HEIGHT, Math.max(DIAGRAM_MIN_HEIGHT, fitted))
}

const BPMN_DI = "http://www.omg.org/spec/BPMN/20100524/DI"
const DD_DC = "http://www.omg.org/spec/DD/20100524/DC"
const DD_DI = "http://www.omg.org/spec/DD/20100524/DI"

/** A numeric attribute, NaN when it is missing or no number. */
function numberAttr(el: Element, name: string): number {
  const value = el.getAttribute(name)
  return value === null ? Number.NaN : Number(value)
}

/**
 * The extent of the diagram bpmn-js shows (the document's first
 * `BPMNDiagram`: shapes, labels and edge waypoints), read from the XML's
 * diagram interchange BEFORE the import — so the frame has its height on the
 * first paint and does not jump once the diagram is drawn, or when a view
 * swaps one diagram widget for another over the same XML. Null for a
 * document without readable DI; the hook then measures the drawn diagram.
 */
export function diagramBoundsFromXml(xml: string): DiagramBounds | null {
  if (!xml || typeof DOMParser === "undefined") return null
  const doc = new DOMParser().parseFromString(xml, "application/xml")
  if (doc.getElementsByTagName("parsererror").length > 0) return null
  // Matched by namespace and local name (any prefix: `dc:`, `omgdc:` …),
  // walking the elements: `getElementsByTagNameNS` is not reliable in every
  // DOM the kit's tests run in.
  const is = (el: Element, ns: string, name: string) =>
    el.namespaceURI === ns && el.localName === name
  const diagram = Array.from(doc.getElementsByTagName("*")).find((el) =>
    is(el, BPMN_DI, "BPMNDiagram"),
  )
  if (!diagram) return null
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const extend = (x: number, y: number, width: number, height: number) => {
    if (![x, y, width, height].every(Number.isFinite)) return
    box.minX = Math.min(box.minX, x)
    box.minY = Math.min(box.minY, y)
    box.maxX = Math.max(box.maxX, x + width)
    box.maxY = Math.max(box.maxY, y + height)
  }
  for (const el of Array.from(diagram.getElementsByTagName("*"))) {
    if (is(el, DD_DC, "Bounds")) {
      extend(
        numberAttr(el, "x"),
        numberAttr(el, "y"),
        numberAttr(el, "width"),
        numberAttr(el, "height"),
      )
    } else if (is(el, DD_DI, "waypoint")) {
      extend(numberAttr(el, "x"), numberAttr(el, "y"), 0, 0)
    }
  }
  const width = box.maxX - box.minX
  const height = box.maxY - box.minY
  return width > 0 && height > 0 ? { width, height } : null
}

/** The drawn diagram's extent from the viewer, or null when it has none to report. */
function drawnBounds(canvas: BpmnCanvas): DiagramBounds | null {
  try {
    const inner = canvas.viewbox().inner
    return inner && inner.width > 0 && inner.height > 0
      ? { width: inner.width, height: inner.height }
      : null
  } catch {
    return null
  }
}

const FALLBACK_IMPORT_ERROR = "Failed to render the BPMN diagram."

/** Zoom clamp — matches bpmn-js's own navigation limits, keeps ± buttons sane. */
const ZOOM_MIN = 0.2
const ZOOM_MAX = 4

export interface UseBpmnViewerOptions {
  bpmnXml: string
  /**
   * Runs after a successful `importXML` (the canvas is already fitted). This is
   * where a caller applies its decoration — markers/overlays, a heat canvas,
   * event-bus subscriptions. May return a cleanup function, which runs before
   * the viewer is destroyed. The latest callback is read at import time, so a
   * new function identity alone never re-imports the diagram.
   */
  onImported?: (viewer: BpmnViewerWithGet) => void | (() => void)
  /**
   * Extra value folded into the mount effect's dependencies: when its identity
   * changes the viewer is torn down and the XML re-imported (bpmn-js decoration
   * is add-only, so "redecorate" means "remount"). Leave unset for viewers that
   * only re-import when the XML itself changes.
   */
  reimportKey?: unknown
  /**
   * Refit the diagram (rAF-debounced) whenever the container resizes. Off by
   * default — the heatmap deliberately preserves the operator's pan/zoom and
   * only repaints its overlay on resize.
   */
  fitOnResize?: boolean
}

export interface UseBpmnViewerResult {
  /**
   * Attach to the div the viewer should render into. The hook paints that div
   * as the fixed light BPMN canvas, in every theme.
   */
  containerRef: RefObject<HTMLDivElement | null>
  /**
   * The frame height for this diagram at the container's current width
   * ({@link diagramHeight}): set it as the container's (or its wrapper's)
   * height unless the widget has a fixed one. Known on the first paint when
   * the XML carries its diagram interchange; the hook refits when it changes.
   */
  height: number
  /** Import failure message, or `null` while the diagram renders fine. */
  importError: string | null
  zoomIn: () => void
  zoomOut: () => void
  /** Fit to the viewport, centred, with the shared 0.95 breathing-room factor. */
  fit: () => void
}

/**
 * Owns the bpmn-js NavigatedViewer lifecycle shared by every BPMN widget:
 * the light canvas on `containerRef`, its height, mount, `importXML`, initial
 * fit-to-viewport (centred, ×0.95), import-error state, zoom handlers, and
 * teardown (`viewer.destroy()`).
 * Callers layer their distinctive behavior on top via {@link UseBpmnViewerOptions.onImported}.
 */
export function useBpmnViewer({
  bpmnXml,
  onImported,
  reimportKey,
  fitOnResize = false,
}: UseBpmnViewerOptions): UseBpmnViewerResult {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<NavigatedViewer | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  // The drawn diagram's extent, for an XML whose DI the kit could not read;
  // tagged with its XML so a new diagram never inherits the last one's.
  const [drawn, setDrawn] = useState<{ xml: string; bounds: DiagramBounds | null } | null>(null)
  const [width, setWidth] = useState(0)
  // Latest callback, read at import time so identity changes don't remount.
  // Synced in an effect (not during render) so a discarded render can't leak
  // into the ref; declared before the mount effect below, so the ref is already
  // current by the time an import can read it.
  const onImportedRef = useRef(onImported)
  useEffect(() => {
    onImportedRef.current = onImported
  })

  // Before paint, so the canvas never shows the themed card for a frame; on
  // every commit, since the ref may now point at a different element.
  useLayoutEffect(() => {
    if (containerRef.current) paintLightCanvas(containerRef.current)
  })

  const getCanvas = useCallback((): BpmnCanvas | null => {
    if (!viewerRef.current) return null
    return (viewerRef.current as unknown as BpmnViewerWithGet).get("canvas")
  }, [])

  const fit = useCallback(() => {
    const canvas = getCanvas()
    if (!canvas) return
    canvas.resized()
    // Centred: a diagram smaller than the frame sits in its middle instead of
    // at its own top-left offset, with the empty room on one side.
    canvas.zoom("fit-viewport", "auto")
    canvas.zoom(canvas.zoom() * 0.95)
  }, [getCanvas])

  const zoomIn = useCallback(() => {
    const canvas = getCanvas()
    if (canvas) canvas.zoom(Math.min(ZOOM_MAX, canvas.zoom() * 1.1))
  }, [getCanvas])

  const zoomOut = useCallback(() => {
    const canvas = getCanvas()
    if (canvas) canvas.zoom(Math.max(ZOOM_MIN, canvas.zoom() * 0.9))
  }, [getCanvas])

  // The container's width drives the frame height: read before the first
  // paint (a layout effect), so the frame never shows the default first, then
  // followed on every resize.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    setWidth(container.clientWidth)
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => setWidth(container.clientWidth))
    observer.observe(container)
    return () => observer.disconnect()
  }, [bpmnXml])

  const xmlBounds = useMemo(() => diagramBoundsFromXml(bpmnXml), [bpmnXml])
  const bounds = xmlBounds ?? (drawn?.xml === bpmnXml ? drawn.bounds : null)
  // Inline in a chat the frame stays low enough to leave room for the rest of
  // the card (#396); fullscreen draws it at its own height.
  const { diagramMaxHeight } = useInlineBudget()
  const height = Math.min(diagramHeight(bounds, width), diagramMaxHeight ?? Infinity)
  // The frame took a new height: fit the diagram into it. A height change
  // from a new width refits only a viewer that refits on resize anyway — the
  // heatmap keeps the operator's pan and zoom; a new diagram size refits both.
  const refitOn = fitOnResize ? height : bounds
  useLayoutEffect(() => {
    fit()
  }, [refitOn, fit])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !bpmnXml) return

    const viewer = new NavigatedViewer({ container })
    viewerRef.current = viewer
    let cancelled = false
    let importCleanup: (() => void) | null = null
    setImportError(null)

    void (async () => {
      try {
        await viewer.importXML(bpmnXml)
      } catch (err) {
        if (cancelled) return
        setImportError(err instanceof Error ? err.message : FALLBACK_IMPORT_ERROR)
        return
      }
      if (cancelled) return
      fit()
      const canvas = getCanvas()
      if (canvas) setDrawn({ xml: bpmnXml, bounds: drawnBounds(canvas) })
      // Decoration failures (e.g. no 2D canvas context for the heat LUT) must
      // surface like import failures — outside this try they'd be a silent
      // unhandled rejection and the widget would render an undecorated diagram.
      try {
        const cleanup = onImportedRef.current?.(viewer)
        importCleanup = typeof cleanup === "function" ? cleanup : null
      } catch (err) {
        setImportError(err instanceof Error ? err.message : FALLBACK_IMPORT_ERROR)
      }
    })()

    let rafId: number | null = null
    let observer: ResizeObserver | null = null
    if (fitOnResize) {
      observer = new ResizeObserver(() => {
        if (rafId !== null) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => {
          rafId = null
          fit()
        })
      })
      observer.observe(container)
    }

    return () => {
      cancelled = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      observer?.disconnect()
      importCleanup?.()
      viewerRef.current = null
      viewer.destroy()
    }
    // `reimportKey` is a deliberate extra dependency: it lets callers force a
    // teardown + re-import when their decoration inputs change.
  }, [bpmnXml, reimportKey, fitOnResize, fit, getCanvas])

  return { containerRef, height, importError, zoomIn, zoomOut, fit }
}
