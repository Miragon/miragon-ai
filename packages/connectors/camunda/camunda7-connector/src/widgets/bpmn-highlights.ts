import { BPMN_TOKENS, type BpmnCanvas, type BpmnOverlays } from "@miragon-ai/widget-shell/widgets"

/**
 * The diagram-overlay colours, by meaning: the kit's ONE BPMN token module
 * (`BPMN_TOKENS`, widget-shell's `bpmn-tokens.ts` — every value a `--cd-*`
 * corporate-design token, drift- and contrast-tested there). Red only for
 * incidents; running and an open user task blue on the info tint (the task
 * with a heavier dashed stroke, standing still — no pulse); counts white on
 * blue or red. The marker classes and badges below are styled by the kit's
 * `BPMN_OVERLAY_CSS` (`injectBpmnOverlayCss`); the legend swatches read the
 * same tokens (`markerSwatch` / `badgeSwatch`), so legend and diagram cannot
 * drift.
 */
export const HIGHLIGHT_COLORS = {
  running: BPMN_TOKENS.running,
  openTask: BPMN_TOKENS.openTask,
  incident: BPMN_TOKENS.incident,
  instanceBadge: BPMN_TOKENS.instanceBadge,
  incidentBadge: BPMN_TOKENS.incidentBadge,
} as const

/**
 * Semantic highlight modes for the BpmnDiagram widget. Each kind has one
 * canonical visual treatment so a caller can declare *what* it wants to
 * show without picking colors or overlay positions.
 *
 * When the same activity appears in multiple kinds the priority is
 * `incident > open-task > active`. Lower-priority markers are skipped
 * for that activity so the SVG is never decorated with two competing
 * fills.
 */
export type BpmnHighlight =
  | { kind: "active"; activityIds: ReadonlyArray<string> }
  | {
      kind: "incident"
      activityIds: ReadonlyArray<string>
      /** Optional red count badge per activity (top-left) — open-incident
       *  count, e.g. how many incidents target this activity. */
      counts?: ReadonlyArray<{ activityId: string; count: number }>
    }
  | {
      kind: "failed-jobs"
      /** Red count badge per activity (top-left) — number of failed jobs
       *  attached to this activity, regardless of whether an incident
       *  exists yet. */
      counts: ReadonlyArray<{ activityId: string; count: number }>
    }
  | { kind: "open-task"; activityIds: ReadonlyArray<string> }
  | {
      kind: "instance-count"
      counts: ReadonlyArray<{ activityId: string; count: number }>
    }

/** Exposed for unit tests. Order-preserving dedupe. */
export function dedupe(values: ReadonlyArray<string>): string[] {
  return Array.from(new Set(values))
}

function safeAddMarker(canvas: Pick<BpmnCanvas, "addMarker">, activityId: string, marker: string) {
  try {
    canvas.addMarker(activityId, marker)
  } catch {
    /* activity may not exist in the rendered diagram */
  }
}

function safeAddOverlay(
  overlays: BpmnOverlays,
  activityId: string,
  overlay: { position: object; html: string },
) {
  try {
    overlays.add(activityId, overlay)
  } catch {
    /* activity may not exist in the rendered diagram */
  }
}

/**
 * Exposed for unit tests. Walks the declarative highlight set and
 * applies the matching markers + overlays to the bpmn-js canvas.
 * Priority order between marker classes is `incident > open-task >
 * active`; lower-priority markers are skipped on activities that are
 * already claimed by a higher-priority kind.
 */
export function applyHighlights(
  canvas: Pick<BpmnCanvas, "addMarker">,
  overlays: BpmnOverlays,
  highlights: ReadonlyArray<BpmnHighlight>,
) {
  const { incidentIds, openTaskIds, activeIds } = collectMarkerIds(highlights)
  applyMarkers(canvas, incidentIds, openTaskIds, activeIds)
  applyCountOverlays(overlays, highlights)
}

function collectMarkerIds(highlights: ReadonlyArray<BpmnHighlight>) {
  const incidentIds: string[] = []
  const openTaskIds: string[] = []
  const activeIds: string[] = []

  for (const h of highlights) {
    if (h.kind === "incident") {
      incidentIds.push(...h.activityIds)
    } else if (h.kind === "open-task") {
      openTaskIds.push(...h.activityIds)
    } else if (h.kind === "active") {
      activeIds.push(...h.activityIds)
    }
  }

  return { incidentIds, openTaskIds, activeIds }
}

function applyMarkers(
  canvas: Pick<BpmnCanvas, "addMarker">,
  incidentIds: ReadonlyArray<string>,
  openTaskIds: ReadonlyArray<string>,
  activeIds: ReadonlyArray<string>,
) {
  const incidentSet = new Set(incidentIds)
  const openTaskSet = new Set(openTaskIds)

  for (const id of dedupe(activeIds)) {
    if (incidentSet.has(id) || openTaskSet.has(id)) continue
    safeAddMarker(canvas, id, "highlight-running")
  }
  for (const id of dedupe(openTaskIds)) {
    if (incidentSet.has(id)) continue
    safeAddMarker(canvas, id, "highlight-open-user-task")
  }
  for (const id of dedupe(incidentIds)) {
    safeAddMarker(canvas, id, "highlight-incident")
  }
}

function applyCountOverlays(overlays: BpmnOverlays, highlights: ReadonlyArray<BpmnHighlight>) {
  for (const h of highlights) {
    if (h.kind === "incident" && h.counts) {
      addRedCountOverlays(overlays, h.counts)
    } else if (h.kind === "failed-jobs") {
      addRedCountOverlays(overlays, h.counts)
    } else if (h.kind === "instance-count") {
      addInstanceCountOverlays(overlays, h.counts)
    }
  }
}

function addInstanceCountOverlays(
  overlays: BpmnOverlays,
  counts: ReadonlyArray<{ activityId: string; count: number }>,
) {
  for (const c of counts) {
    const safeCount = Number(c.count) || 0
    if (safeCount <= 0) continue
    safeAddOverlay(overlays, c.activityId, {
      position: { top: -14, right: -14 },
      html: `<div class="bpmn-overlay-badge bpmn-overlay-badge--instance-count">${safeCount}</div>`,
    })
  }
}

function addRedCountOverlays(
  overlays: BpmnOverlays,
  counts: ReadonlyArray<{ activityId: string; count: number }>,
) {
  for (const c of counts) {
    const safeCount = Number(c.count) || 0
    if (safeCount <= 0) continue
    safeAddOverlay(overlays, c.activityId, {
      position: { top: -14, left: -14 },
      html: `<div class="bpmn-overlay-badge bpmn-overlay-badge--incident-count">${safeCount}</div>`,
    })
  }
}
