import type { MessageCatalog } from "@miragon/mcp-toolkit-core"

/** German message catalog. Missing keys fall back to {@link en} via the translator. */
export const de: MessageCatalog = {
  // ── Cockpit shell ──────────────────────────────────────────────────────────
  "cockpit.section.overview": "Übersicht",
  "cockpit.section.incidents": "Vorfälle",
  "cockpit.section.settings": "Einstellungen",
  "cockpit.crumb.overview": "Übersicht",
  "cockpit.crumb.incidents": "Vorfälle",
  "cockpit.crumb.instances": "Instanzen",
  // Die {id} kommt bereits gekürzt an (Kit-`truncate` ergänzt die Ellipse).
  "cockpit.crumb.instance": ({ id }) => `Instanz ${String(id)}`,
  "cockpit.crumb.incident": ({ id }) => `Vorfall ${String(id)}`,
  "cockpit.crumb.cluster": ({ activity }) => `Cluster: ${String(activity)}`,
  "cockpit.loading.engines": "Engines werden geladen…",
  "cockpit.empty.engines": "Keine CIB-Seven-Engines konfiguriert.",
  "cockpit.nav.crossEngine": "Engine-übergreifend",
  "cockpit.nav.engine": "Engine",
  "cockpit.aria.breadcrumb": "Breadcrumb-Navigation",
  "cockpit.aria.sections": "Cockpit-Bereiche",
  "cockpit.aria.activeEngine": "Aktive Engine",
  "cockpit.landing.title": "CIB Seven Cockpit",
  "cockpit.landing.subtitle": ({ count }) =>
    `${String(count)} Engines konfiguriert — eine Engine bedienen oder über die gesamte Flotte analysieren.`,
  "cockpit.landing.operate.title": "Eine Engine bedienen",
  "cockpit.landing.operate.desc": "Übersicht, Vorfälle und Drill-downs für eine Engine.",
  "cockpit.landing.fleet.title": "Engine-übergreifende Analysen",
  "cockpit.landing.fleet.desc":
    "Flottengesundheit über alle Engines, Engine-Vergleich sowie flottenweite Fehler- & Performance-Analyse.",
  "cockpit.landing.fleet.open": "Flottenansicht öffnen",
  "cockpit.crumb.cockpit": "Cockpit",
  "cockpit.crumb.fleet": "Flotte",

  // ── Profil-/Einstellungs-Panel ──────────────────────────────────────────────
  "profile.heading": "Profil & Einstellungen",
  "profile.subtitle":
    "Einstellungen für diese Sitzung — Engine-Verfügbarkeit, Sprache, Theme, Dashboards und Analyse-Standardwerte.",
  "profile.save": "Speichern",
  "profile.saving": "Speichern…",
  "profile.saved": ({ time }) => `Gespeichert ${String(time)}`,
  "profile.saveError": "Profil konnte nicht gespeichert werden.",
  "profile.loading": "Laden…",
  "profile.none": "Kein Profil verfügbar",

  "profile.section.appearance": "Sprache & Darstellung",
  "profile.section.engines": "Engines",
  "profile.section.dashboards": "Dashboards",
  "profile.section.analytics": "Analyse-Standardwerte",

  "profile.field.language": "Sprache",
  "profile.field.language.help":
    "UI-Sprache. Steuert auch die Sprache der an das Modell zurückgegebenen Tool-Zusammenfassungen.",
  "profile.field.theme": "Theme",
  "profile.field.role": "Bevorzugte Rolle",
  "profile.field.role.help": "Nur ein Hinweis — der Tool-Zugriff wird über die Verbindung gesetzt.",
  "profile.role.unset": "(nicht gesetzt)",

  "profile.field.allowedEngines": "Verfügbare Engines",
  "profile.field.allowedEngines.help":
    "Aus welchen Engines du wählen kannst. Alle abwählen = alle erlauben. Kuratierung, keine Zugriffskontrolle.",
  "profile.engines.none": "Keine Engines konfiguriert.",
  "profile.field.defaultEngine": "Standard-Engine",
  "profile.field.defaultEngine.help": "Die Engine, mit der das Cockpit öffnet.",
  "profile.engine.auto": "(automatisch)",

  "profile.dashboards.unavailable": "Gespeicherte Dashboards sind nicht verfügbar.",
  "profile.dashboards.empty": "Noch keine gespeicherten Dashboards.",
  "profile.field.defaultDashboard": "Standard-Dashboard",
  "profile.field.defaultDashboard.help": "Wird beim Öffnen des Cockpits zuerst angezeigt.",
  "profile.dashboard.none": "(keins)",
  "profile.field.pinnedDashboards": "Angepinnte Dashboards",
  "profile.field.pinnedDashboards.help": "Werden in Dashboard-Auswahlen zuerst angezeigt.",

  "profile.field.analyticsPeriod": "Standard-Zeitraum",
  "profile.field.analyticsPeriod.help": "Standard-Rückblickfenster für Analysen.",
  "profile.field.minBucket": "Min. Bucket-Größe",
  "profile.field.minBucket.help": "Minimale Aktivitäts-Bucket-Größe für die Aggregation.",

  "profile.summary": ({ language, theme, engines, period }) =>
    `Benutzerprofil: Sprache ${String(language)}, Theme ${String(theme)}, ${String(engines)}, Analyse-Zeitraum ${String(period)}.`,
  "profile.summary.allEngines": "alle Engines",
  "profile.summary.someEngines": ({ count }) => `${String(count)} erlaubte Engine(s)`,

  // ── Aufzählungs-Optionen ────────────────────────────────────────────────────
  "theme.light": "Hell",
  "theme.dark": "Dunkel",
  "theme.system": "System",
  "role.read-only": "Nur Lesen",
  "role.operations": "Betrieb",
  "role.admin": "Administrator",

  // ── Modellseitige Widget-Tool-Zusammenfassungen (c7sum.*) ────────────────────
  "c7sum.cockpitOpened":
    'Das CIB-Seven-Cockpit wurde auf Engine "{engineId}" geöffnet ({engineCount} Engine(s) konfiguriert). Der Benutzer kann die Prozesslandschaft von hier aus clientseitig navigieren.',
  "c7sum.cockpitOpenedPicker":
    "Das CIB-Seven-Cockpit wurde mit einer Engine-Auswahl geöffnet ({engineCount} Engines konfiguriert, keine ausgewählt).",
  "c7sum.processList":
    'Prozessliste: {totalCount} bereitgestellte Definition(en){filters} auf Engine "{engineId}".',
  "c7sum.state.active": "aktiv",
  "c7sum.state.suspended": "ausgesetzt",
  "c7sum.state.ended": "beendet",
  "c7sum.instanceDetail":
    "Prozessinstanz {instanceId}{businessKey}: {state}, {activeActivities} aktive Aktivitäten, {openIncidents} offene Vorfälle, {openTasks} offene Benutzeraufgaben.",
  "c7sum.processInstances":
    '{totalCount} laufende Instanz(en) von "{processDefinitionKey}" ({withIncidentCount} mit Vorfällen, {suspendedCount} ausgesetzt); {returnedCount} in der Tabelle angezeigt.',
  "c7sum.incidentsDashboard":
    "Vorfall-Dashboard: {totalCount} offene(r) Vorfall/Vorfälle über {processCount} Prozessdefinition(en), {last24hCount} in den letzten 24 Stunden.",
  "c7sum.processIncidents":
    'Prozessvorfälle für "{processDefinitionKey}"{version}: {incidentCount} offene(r) Vorfall/Vorfälle über {activities} Aktivitäten, {last24hCount} in den letzten 24 Stunden.',
  "c7sum.incidentDetail":
    'Vorfall {incidentId} ({incidentType}) bei Aktivität "{activity}" in "{processDefinitionKey}", Instanz {processInstanceId}{message}.',
  "c7sum.processDetail":
    'Prozess "{processDefinitionKey}"{version}: {runningInstances} laufende Instanz(en), {openIncidents} offene(r) Vorfall/Vorfälle, {failedJobs} fehlgeschlagene(r) Job(s).',
  "c7sum.historyTimeline":
    "Verlaufs-Zeitleiste für Prozessinstanz {processInstanceId}: {totalActivities} historische Aktivitäten{notFound}.",
  "c7sum.historyTimeline.notFound": " (keine historische Prozessinstanz gefunden)",
  "c7sum.engineHealth":
    'Engine "{engineId}" — {status}: {totalIncidents} offene Vorfälle über {affectedActivities} Aktivitäten, {runningInstances} laufende Instanzen.{topCluster}',
  "c7sum.engineHealth.topCluster":
    ' Größter Cluster: Aktivität "{activityId}" / {incidentType}, {incidentCount} Vorfälle.',
  "c7sum.engineHealth.noIncidents": " Keine offenen Vorfälle.",
  "c7sum.clusterDetail":
    'Fehler-Cluster auf Engine "{engineId}": Aktivität "{activityId}" / {incidentType} — {incidentCount} Vorfälle ({lastHourCount} in der letzten Stunde) über {processes}.{sample}',
  "c7sum.clusterDetail.unknownProcesses": "unbekannte Prozesse",
  "c7sum.clusterDetail.sample": " Beispiel: {message}",
  "c7sum.bpmnViewer":
    "Das BPMN-Diagramm für {target}{overlayInfo}{xmlUnavailable} wurde gerendert.",
  "c7sum.bpmnViewer.empty":
    "BPMN-Viewer: Keine passende Prozessdefinition gefunden — ein leeres Diagramm wurde gerendert.",
  "c7sum.bpmnViewer.targetInstance": "Prozessinstanz {processInstanceId}",
  "c7sum.bpmnViewer.targetDefinition": "Prozessdefinition {definitionId}",
  "c7sum.bpmnViewer.overlays":
    ": {activeActivities} aktive Aktivitäten, {incidentActivities} Aktivitäten mit Vorfällen, {failedJobs} fehlgeschlagene Jobs",
  "c7sum.bpmnViewer.noOverlays": " (statisches Diagramm, keine Instanz-Overlays)",
  "c7sum.bpmnViewer.xmlUnavailable": " — Diagramm-XML nicht verfügbar",
  "c7sum.jobPanel":
    "Job-Panel: {totalCount} Job(s), {failedCount} fehlgeschlagen{forProcess}{failedOnly}.",
  "c7sum.jobPanel.forProcess": ' für "{processDefinitionKey}"',
  "c7sum.jobPanel.failedOnly": " (nur fehlgeschlagene)",
}
