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
    'Engine-Vergleich des Prozesses "{key}" auf "{engineA}" vs. "{engineB}" über {windowDays} d: {delta}{suppressed}.',
  "aSum.engineLandscape":
    "Engine-übergreifende Übersicht: {engineCount} Engine(s) ({reportingEngineCount} mit Metriken), {processKeyCount} Prozessdefinition(en), {runningInstances} laufende Instanz(en), {openIncidents} offene(r) Vorfall/Vorfälle.{shared}",
  "aSum.failureDashboard":
    "Fehler-Dashboard: {totalIncidents} offene(r) Vorfall/Vorfälle über {uniqueErrorPatterns} Fehlermuster{mostAffected}.",
  "aSum.mostAffectedProcess": '; am stärksten betroffener Prozess: "{key}"',
  "aSum.scopeForProcess": ' für "{key}"',
  "aSum.sharedKeys":
    " Auf mehreren Engines deployt (die einzigen belastbaren Engine-Vergleiche): {keys}.",
  "aSum.settings":
    "Analyse-Einstellungen: Standard-Zeitraum {period}, min. Bucket-Größe {minBucketSize}.{changeHint}",
  "aSum.settingsChangeHint": " Änderbar über analytics_save_settings.",
  "aSum.settingsSaved":
    "Analyse-Einstellungen gespeichert: Standard-Zeitraum {period}, min. Bucket-Größe {minBucketSize}.",
  "aSum.versionCompare":
    'Versionsvergleich für "{key}" v{versionA} vs. v{versionB} über {windowDays} d: {delta}{suppressed}.',
}
