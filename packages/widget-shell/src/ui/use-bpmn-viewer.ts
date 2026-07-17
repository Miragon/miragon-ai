import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer"
import { type BpmnElement } from "./bpmn-heatmap/heat-utils.js"

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
  viewbox(): { x: number; y: number; width: number; height: number; scale: number }
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

const FALLBACK_IMPORT_ERROR = "Failed to render the BPMN diagram."

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
  /** Attach to the div the viewer should render into. */
  containerRef: RefObject<HTMLDivElement | null>
  /** Import failure message, or `null` while the diagram renders fine. */
  importError: string | null
  zoomIn: () => void
  zoomOut: () => void
  /** Fit to viewport with the shared 0.95 breathing-room factor. */
  fit: () => void
}

/**
 * Owns the bpmn-js NavigatedViewer lifecycle shared by every BPMN widget:
 * mount into `containerRef`, `importXML`, initial fit-to-viewport (×0.95),
 * import-error state, zoom handlers, and teardown (`viewer.destroy()`).
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
  // Latest callback, read at import time so identity changes don't remount.
  const onImportedRef = useRef(onImported)
  onImportedRef.current = onImported

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
    if (canvas) canvas.zoom(canvas.zoom() * 1.1)
  }, [getCanvas])

  const zoomOut = useCallback(() => {
    const canvas = getCanvas()
    if (canvas) canvas.zoom(canvas.zoom() * 0.9)
  }, [getCanvas])

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
      const cleanup = onImportedRef.current?.(viewer as unknown as BpmnViewerWithGet)
      importCleanup = typeof cleanup === "function" ? cleanup : null
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
  }, [bpmnXml, reimportKey, fitOnResize, fit])

  return { containerRef, importError, zoomIn, zoomOut, fit }
}
