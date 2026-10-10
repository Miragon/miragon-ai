import type { MessageCatalog } from "@miragon/mcp-toolkit-core"

/** German model-facing analytics tool summaries (aSum.*). Generated, hand-editable. */
export const deServer: MessageCatalog = {
  "aSum.bpmnHeatmap":
    'BPMN-Heatmap für "{key}" über {period}{engines}: Heat-Werte für {elementCount} Element(e){fallbackNote}.',
  "aSum.bpmnHeatmapNoXml":
    " — kein BPMN-XML verfügbar, das Widget zeigt die Nicht-Diagramm-Ersatzansicht",
  "aSum.clusterCompare":
    "Vor/Nach-Deployment-Vergleich{scope}{engines} um {deploymentTimestamp} (gemessen -{before} d / +{after} d{partial}): {delta}{suppressed}.",
  "aSum.clusterComparePartial":
    ", unvollständig — ein Fenster wurde bei jetzt oder an der Aufbewahrungsgrenze gekürzt; Starts werden pro Tag verglichen",
  "aSum.dashboard":
    "Analyse-Dashboard{scope} über {period}{engines}: im Zeitraum {totalCount} Instanz(en) gestartet, {completedCount} abgeschlossen, {incidentsCreated} Vorfall/Vorfälle erzeugt ({incidentRatePct} pro 100 gestartete); aktuell {runningNow} laufend, {openIncidentsNow} Vorfall/Vorfälle offen.",
  "aSum.engineCompare":
    'Engine-Vergleich des Prozesses "{key}" auf "{engineA}" vs. "{engineB}" über {windowDays} d: {delta}{suppressed}.',
  "aSum.engineLandscape":
    "Engine-übergreifende Übersicht: {engineCount} Engine(s) ({reportingEngineCount} mit Metriken), {processKeyCount} Prozessdefinition(en), {runningInstances} laufende Instanz(en), {openIncidents} offene(r) Vorfall/Vorfälle.{shared}",
  "aSum.engineScopeFleet": " über alle {count} konfigurierten Engines ({ids}), aggregiert",
  "aSum.engineScopeOne": ' auf Engine "{id}"',
  "aSum.engineScopeSubset": " über die Engines {ids}, aggregiert",
  "aSum.failureDashboard":
    "Fehler-Dashboard{engines}: aktuell {totalIncidents} offene(r) Vorfall/Vorfälle in {uniqueErrorPatterns} Gruppe(n) nach Vorfallstyp und Prozess{mostAffected}.",
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
    'Versionsvergleich für "{key}" v{versionA} vs. v{versionB} über {windowDays} d{engines}: {delta}{incidents}{suppressed}.',
  "aSum.versionIncidentsUnavailable":
    " — Vorfallsraten pro Version nicht verfügbar (die Vorfallsmetrik trägt kein Versionslabel), nicht 0",
}
