import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer"
import { type BpmnElement } from "./bpmn-heatmap/heat-utils.js"
import { BPMN_TOKENS, cdVar } from "./bpmn-tokens.js"

/**
 * Structural typings for the bpmn-js services the widgets touch. bpmn-js ships
 * no usable types on `Viewer#get`, so the slice the widgets rely on is declared
 * once, here — a superset shared by the plain diagram (markers/overlays) and
 * the heatmap (viewbox/element registry/event bus).
 */
export interface BpmnCanvas {
  zoom(mode: "fit-viewport"): void
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
/** Before the diagram's shape is known (or without one). */
export const DIAGRAM_DEFAULT_HEIGHT = 360
/** Room above and below the fitted diagram: the fit's 0.95 margin plus the zoom bar's reach. */
const DIAGRAM_HEIGHT_PADDING = 48

/**
 * The frame height that shows a diagram whole at the container's width: its
 * aspect ratio (height / width, diagram units) times the width, plus room for
 * the zoom controls, clamped to {@link DIAGRAM_MIN_HEIGHT}–{@link DIAGRAM_MAX_HEIGHT}.
 * A wide, flat process gets a low frame instead of a fixed 400 px with half
 * of it empty; a tall one stops at a screenful and stays pannable.
 */
export function diagramHeight(aspect: number | null, width: number): number {
  if (aspect === null || !(aspect > 0) || !(width > 0)) return DIAGRAM_DEFAULT_HEIGHT
  const fitted = Math.ceil((width * aspect) / 0.95) + DIAGRAM_HEIGHT_PADDING
  return Math.min(DIAGRAM_MAX_HEIGHT, Math.max(DIAGRAM_MIN_HEIGHT, fitted))
}

/** The diagram's aspect ratio from the viewer's bounds, or null when it has none to report. */
function diagramAspect(canvas: BpmnCanvas): number | null {
  try {
    const inner = canvas.viewbox().inner
    return inner && inner.width > 0 && inner.height > 0 ? inner.height / inner.width : null
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
   * height unless the widget has a fixed one. The hook refits when it changes.
   */
  height: number
  /** Import failure message, or `null` while the diagram renders fine. */
  importError: string | null
  zoomIn: () => void
  zoomOut: () => void
  /** Fit to viewport with the shared 0.95 breathing-room factor. */
  fit: () => void
}

/**
 * Owns the bpmn-js NavigatedViewer lifecycle shared by every BPMN widget:
 * the light canvas on `containerRef`, mount, `importXML`, initial
 * fit-to-viewport (×0.95), import-error state, zoom handlers, and teardown
 * (`viewer.destroy()`).
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
  const [aspect, setAspect] = useState<number | null>(null)
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
    canvas.zoom("fit-viewport")
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

  // The container's width drives the frame height. ResizeObserver reports
  // once when observation starts, then on every resize.
  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => setWidth(container.clientWidth))
    observer.observe(container)
    return () => observer.disconnect()
  }, [bpmnXml])

  const height = diagramHeight(aspect, width)
  // A new diagram's frame height is known: fit the diagram into the resized
  // container. A later height change (the width changed) refits only a
  // viewer that refits on resize anyway — the heatmap keeps the operator's
  // pan and zoom.
  const refitOn = fitOnResize ? height : aspect
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
      if (canvas) setAspect(diagramAspect(canvas))
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
