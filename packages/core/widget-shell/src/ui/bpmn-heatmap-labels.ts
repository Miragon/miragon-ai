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
  bpmnUnavailable?: string
  less?: string
  more?: string
  diagramAriaLabel?: string
  errorTitle?: string
}

export const DEFAULT_HEATMAP_LABELS: Required<BpmnHeatmapLabels> = {
  title: "BPMN heatmap",
  window: "window:",
  frequency: "Frequency",
  duration: "Duration",
  frequencyLegend: "Executions per element",
  durationLegend: "Avg duration per element (s)",
  noData: "No heatmap data.",
  noHeat: "No metric data in this window.",
  bpmnUnavailable:
    "BPMN diagram unavailable: the analytics module has no camunda7 client configured to fetch it.",
  less: "Less",
  more: "More",
  diagramAriaLabel: "BPMN process diagram with an execution heat overlay",
  errorTitle: "Diagram could not be rendered",
}
