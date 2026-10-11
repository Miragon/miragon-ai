/**
 * All user-facing strings of the BPMN heatmap — the shell carries no module
 * i18n, so callers (analytics-connector / camunda7-connector) inject
 * `t()`-resolved values. Every field is optional; the English defaults keep
 * the component usable on its own (and run through the kit's catalog text
 * test).
 */
export interface BpmnHeatmapLabels {
  title?: string
  window?: string
  frequency?: string
  duration?: string
  frequencyLegend?: string
  durationLegend?: string
  noData?: string
  noHeat?: string
  /**
   * Shown when the payload carries no diagram. The kit does not know why (the
   * caller does), so its default names no cause.
   */
  bpmnUnavailable?: string
  less?: string
  more?: string
  diagramAriaLabel?: string
  /** Headline of the import-error alert: what happened, one line. */
  errorTitle?: string
  /**
   * Next step under the import error: what the user can do. No default, so a
   * caller without a localized hint shows no English sentence in its view.
   */
  errorHint?: string
}

export const DEFAULT_HEATMAP_LABELS: Required<Omit<BpmnHeatmapLabels, "errorHint">> = {
  title: "BPMN heatmap",
  window: "window:",
  frequency: "Frequency",
  duration: "Duration",
  frequencyLegend: "Executions per element",
  durationLegend: "Avg duration per element (s)",
  noData: "No heatmap data.",
  noHeat: "No metric data in this window.",
  bpmnUnavailable:
    "The BPMN diagram is not available. Ask in the chat for the figures per element instead.",
  less: "Less",
  more: "More",
  diagramAriaLabel: "BPMN process diagram with an execution heat overlay",
  errorTitle: "Diagram could not be rendered",
}
