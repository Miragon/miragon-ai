import { CD_TOKENS, type CdTokenName } from "@miragon/mcp-toolkit-ui"

/**
 * THE token module of the BPMN canvas (modeler-tool-design §3.6, §10, §13):
 * every colour the diagram's overlays, badges and heat layer paint is a
 * `--cd-*` corporate-design token, named here once. Two consumers read it:
 *
 * - CSS ({@link BPMN_OVERLAY_CSS}) refers to the tokens as `var(--cd-*)`,
 *   which the toolkit's theme vendors on `:root`;
 * - code that needs numbers (the heat canvas, contrast checks) resolves the
 *   same names through the toolkit's `CD_TOKENS`.
 *
 * `bpmn-tokens.test.ts` is the drift test (every name's `CD_TOKENS` value
 * equals the vendored stylesheet's `--cd-*`) and the contrast test (strokes
 * ≥ 3:1 against the paper and their own fill, badge text ≥ 4.5:1).
 *
 * The semantics (owner decision, #322): an incident is `danger` (stroke,
 * tint, count badge — red only for incidents); running and active activities
 * are blue (`--cd-blau` stroke on the `--cd-info-soft` tint), an open user
 * task the same with a heavier dashed stroke (shape, not colour, tells it
 * apart — and it stands still: no pulse, so `prefers-reduced-motion` has
 * nothing to stop); counts are white on blue or danger.
 */
export const BPMN_TOKENS = {
  /** The paper: always light, in every theme. */
  paper: "weiss",
  incident: { stroke: "danger", fill: "danger-soft" },
  running: { stroke: "blau", fill: "info-soft" },
  openTask: { stroke: "blau", fill: "info-soft" },
  instanceBadge: { fill: "blau", text: "weiss" },
  incidentBadge: { fill: "danger", text: "weiss" },
  /** The data-viz ramp of the heatmap: one hue, pale to full blue. */
  heat: { from: "info-soft", to: "blau" },
} as const satisfies {
  paper: CdTokenName
  incident: { stroke: CdTokenName; fill: CdTokenName }
  running: { stroke: CdTokenName; fill: CdTokenName }
  openTask: { stroke: CdTokenName; fill: CdTokenName }
  instanceBadge: { fill: CdTokenName; text: CdTokenName }
  incidentBadge: { fill: CdTokenName; text: CdTokenName }
  heat: { from: CdTokenName; to: CdTokenName }
}

/** A token as a CSS value (`var(--cd-danger)`). */
export function cdVar(name: CdTokenName): string {
  return `var(--cd-${name})`
}

/** A token's value (`#CD1839`) — for code that paints numbers, never for CSS. */
export function cdValue(name: CdTokenName): string {
  return CD_TOKENS[name]
}

/**
 * Stroke widths in diagram units: 2 for a state, 3 for an open user task
 * (with its dash), bpmn-js draws plain shapes at 2.
 */
const STATE_STROKE = 2
const OPEN_TASK_STROKE = 3
const OPEN_TASK_DASH = "8 4"

const { incident, running, openTask, instanceBadge, incidentBadge } = BPMN_TOKENS

/**
 * The overlay stylesheet: marker classes on bpmn-js shapes
 * (`canvas.addMarker(id, "highlight-incident")`) and the count badges added
 * as overlays (`<div class="bpmn-overlay-badge bpmn-overlay-badge--…">`).
 * Inject it once per document with {@link injectBpmnOverlayCss}.
 */
export const BPMN_OVERLAY_CSS = `
.highlight-running:not(.djs-connection) .djs-visual > :nth-child(1) {
  fill: ${cdVar(running.fill)} !important;
  stroke: ${cdVar(running.stroke)} !important;
  stroke-width: ${STATE_STROKE}px !important;
}
.highlight-open-user-task:not(.djs-connection) .djs-visual > :nth-child(1) {
  fill: ${cdVar(openTask.fill)} !important;
  stroke: ${cdVar(openTask.stroke)} !important;
  stroke-width: ${OPEN_TASK_STROKE}px !important;
  stroke-dasharray: ${OPEN_TASK_DASH} !important;
}
.highlight-incident:not(.djs-connection) .djs-visual > :nth-child(1) {
  fill: ${cdVar(incident.fill)} !important;
  stroke: ${cdVar(incident.stroke)} !important;
  stroke-width: ${STATE_STROKE}px !important;
}
.bpmn-overlay-badge {
  border-radius: var(--cd-radius-pill);
  height: 22px;
  min-width: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  box-shadow: var(--cd-shadow-1);
}
.bpmn-overlay-badge--instance-count {
  background: ${cdVar(instanceBadge.fill)};
  color: ${cdVar(instanceBadge.text)};
}
.bpmn-overlay-badge--incident-count {
  background: ${cdVar(incidentBadge.fill)};
  color: ${cdVar(incidentBadge.text)};
}
`

const STYLE_ID = "bpmn-overlay-css"

/** Add {@link BPMN_OVERLAY_CSS} to the document once (idempotent). */
export function injectBpmnOverlayCss(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement("style")
  style.id = STYLE_ID
  style.textContent = BPMN_OVERLAY_CSS
  doc.head.appendChild(style)
}

/** The legend swatch of a marker: its tint with a stroke-coloured edge, as an inline style. */
export function markerSwatch(marker: { stroke: CdTokenName; fill: CdTokenName }): {
  borderColor: string
  background: string
} {
  return { borderColor: cdVar(marker.stroke), background: cdVar(marker.fill) }
}

/** The legend swatch of a count badge, as an inline style. */
export function badgeSwatch(badge: { fill: CdTokenName; text: CdTokenName }): {
  background: string
  color: string
} {
  return { background: cdVar(badge.fill), color: cdVar(badge.text) }
}
