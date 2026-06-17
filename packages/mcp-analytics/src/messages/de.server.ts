import type { MessageCatalog } from "@miragon/mcp-toolkit-core"

/** German model-facing analytics tool summaries (aSum.*). Generated, hand-editable. */
export const deServer: MessageCatalog = {
  "aSum.bpmnHeatmap":
    'BPMN-Heatmap für "{key}" über {period}: Heat-Werte für {elementCount} Element(e){fallbackNote}.',
  "aSum.bpmnHeatmapNoXml":
    " — kein BPMN-XML verfügbar, das Widget zeigt die Nicht-Diagramm-Ersatzansicht",
  "aSum.clusterCompare":
    "Vor/Nach-Deployment-Vergleich{scope} um {deploymentTimestamp}: {delta}{suppressed}.",
  "aSum.dashboard":
    "Analyse-Dashboard{scope} über {period}: {totalCount} Instanzen — {completedCount} abgeschlossen, {runningCount} laufend, {failedCount} fehlgeschlagen ({failureRatePct} % Fehlerquote, {incidentCount} Vorfälle).",
  "aSum.engineCompare":
    'Engine-Vergleich "{engineA}" vs. "{engineB}"{scope} über {windowDays} d: {delta}{suppressed}.',
  "aSum.failureDashboard":
    "Fehler-Dashboard: {totalIncidents} offene(r) Vorfall/Vorfälle über {uniqueErrorPatterns} Fehlermuster{mostAffected}.",
  "aSum.mostAffectedProcess": '; am stärksten betroffener Prozess: "{key}"',
  "aSum.scopeForProcess": ' für "{key}"',
  "aSum.versionCompare":
    'Versionsvergleich für "{key}" v{versionA} vs. v{versionB} über {windowDays} d: {delta}{suppressed}.',
}
