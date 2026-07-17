import { type BpmnCanvas, type BpmnOverlays } from "@miragon-ai/widget-shell/widgets"

/**
 * Single source of truth for the explicit diagram-overlay colors that get
 * injected into the bpmn-js SVG via {@link HIGHLIGHT_CSS}. These are genuine
 * domain colors (green = running, red = incident, blue = instance count) that
 * must paint SVG strokes/fills, so they stay as concrete values rather than
 * Tailwind tokens — but they live here once instead of being copy-pasted
 * across the rule blocks below and the diagram legends. The mid-ramp hues
 * chosen are legible against both the light card surface and a dark canvas.
 */
export const HIGHLIGHT_COLORS = {
  running: { fill: "rgba(34, 197, 94, 0.15)", stroke: "#16a34a" },
  openTask: { fill: "rgba(34, 197, 94, 0.22)", stroke: "#15803d" },
  incident: { fill: "rgba(239, 68, 68, 0.15)", stroke: "#dc2626" },
  instanceBadge: "#3b82f6",
  incidentBadge: "#ef4444",
} as const

export const HIGHLIGHT_CSS = `
.highlight-running:not(.djs-connection) .djs-visual > :nth-child(1) {
  fill: ${HIGHLIGHT_COLORS.running.fill} !important;
  stroke: ${HIGHLIGHT_COLORS.running.stroke} !important;
  stroke-width: 2px !important;
}
.highlight-open-user-task:not(.djs-connection) .djs-visual > :nth-child(1) {
  fill: ${HIGHLIGHT_COLORS.openTask.fill} !important;
  stroke: ${HIGHLIGHT_COLORS.openTask.stroke} !important;
  stroke-width: 3px !important;
  animation: bpmn-active-task-pulse 1.6s ease-in-out infinite;
}
@keyframes bpmn-active-task-pulse {
  0%, 100% { stroke-opacity: 1; }
  50% { stroke-opacity: 0.45; }
}
.highlight-incident:not(.djs-connection) .djs-visual > :nth-child(1) {
  fill: ${HIGHLIGHT_COLORS.incident.fill} !important;
  stroke: ${HIGHLIGHT_COLORS.incident.stroke} !important;
  stroke-width: 2px !important;
}
.bpmn-overlay-badge {
  border-radius: 9999px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  padding: 0 6px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  font-family: ui-sans-serif, system-ui, sans-serif;
  color: white;
}
.bpmn-overlay-badge--instance-count {
  background: ${HIGHLIGHT_COLORS.instanceBadge};
  min-width: 22px;
}
.bpmn-overlay-badge--incident-count {
  background: ${HIGHLIGHT_COLORS.incidentBadge};
  min-width: 22px;
}
`

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

  for (const h of highlights) {
    if (h.kind === "incident" && h.counts) {
      addRedCountOverlays(overlays, h.counts)
    } else if (h.kind === "failed-jobs") {
      addRedCountOverlays(overlays, h.counts)
    } else if (h.kind === "instance-count") {
      for (const c of h.counts) {
        const safeCount = Number(c.count) || 0
        if (safeCount <= 0) continue
        safeAddOverlay(overlays, c.activityId, {
          position: { top: -14, right: -14 },
          html: `<div class="bpmn-overlay-badge bpmn-overlay-badge--instance-count">${safeCount}</div>`,
        })
      }
    }
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
