import type { MessageCatalog } from "@miragon/mcp-toolkit-core"

/** English model-facing analytics tool summaries (aSum.*). Generated, hand-editable. */
export const enServer: MessageCatalog = {
  "aSum.bpmnHeatmap":
    'BPMN heatmap for "{key}" over {period}: heat values for {elementCount} element(s){fallbackNote}.',
  "aSum.bpmnHeatmapNoXml": " — no BPMN XML available, widget shows the non-diagram fallback",
  "aSum.clusterCompare":
    "Pre/post deployment comparison{scope} around {deploymentTimestamp}: {delta}{suppressed}.",
  "aSum.dashboard":
    "Analytics dashboard{scope} over {period}: {totalCount} instances — {completedCount} completed, {runningCount} running, {failedCount} failed ({failureRatePct}% failure rate, {incidentCount} incidents).",
  "aSum.engineCompare":
    'Engine comparison "{engineA}" vs "{engineB}"{scope} over {windowDays}d: {delta}{suppressed}.',
  "aSum.failureDashboard":
    "Failure dashboard: {totalIncidents} open incident(s) across {uniqueErrorPatterns} error pattern(s){mostAffected}.",
  "aSum.mostAffectedProcess": '; most affected process: "{key}"',
  "aSum.scopeForProcess": ' for "{key}"',
  "aSum.versionCompare":
    'Version comparison for "{key}" v{versionA} vs v{versionB} over {windowDays}d: {delta}{suppressed}.',
}
