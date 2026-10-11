import type { MessageCatalog } from "@miragon/mcp-toolkit-core"
import { countOf } from "./plural.js"

/**
 * German message catalog. Missing keys would fall back to {@link en}, so
 * `catalog-text.test.ts` holds both to the same key set. Folgt brand-tone:
 * du, aktiv, kein Gedankenstrich als Verbinder; die Begriffe stehen in
 * GLOSSARY.md.
 */
export const de: MessageCatalog = {
  // ── Cockpit shell ──────────────────────────────────────────────────────────
  "cockpit.crumb.processList": "Alle Prozesse",
  "cockpit.section.overview": "Übersicht",
  "cockpit.section.incidents": "Incidents",
  "cockpit.section.settings": "Einstellungen",
  "cockpit.crumb.overview": "Übersicht",
  "cockpit.crumb.incidents": "Incidents",
  "cockpit.crumb.instances": "Instanzen",
  "cockpit.crumb.origin": "Start",
  // Die {id} kommt bereits gekürzt an (Kit-`truncate` ergänzt die Ellipse).
  "cockpit.crumb.instance": ({ id }) => `Instanz ${String(id)}`,
  "cockpit.crumb.incident": ({ id }) => `Incident ${String(id)}`,
  "cockpit.crumb.cluster": ({ activity }) => `Cluster: ${String(activity)}`,
  "cockpit.loading.engines": "Engines werden geladen…",
  "cockpit.empty.engines":
    "Keine Engines konfiguriert. Bitte deine Administration, eine Engine in der Server-Konfiguration einzutragen.",
  "cockpit.nav.crossEngine": "Engine-übergreifend",
  "cockpit.nav.engine": "Engine",
  "cockpit.aria.breadcrumb": "Navigationspfad",
  "cockpit.aria.sections": "Cockpit-Bereiche",
  "cockpit.aria.activeEngine": "Gewählte Engine",
  "cockpit.refresh": "Aktualisieren",
  "cockpit.refreshing": "Wird aktualisiert…",
  "cockpit.landing.title": "Operations Cockpit",
  "cockpit.landing.subtitle": ({ count }) =>
    `${countOf(count, "Engine", "Engines")} konfiguriert. Arbeite mit einer Engine, oder analysiere alle zusammen.`,
  "cockpit.landing.subtitle.env": ({ count, envCount }) =>
    `${countOf(count, "Engine", "Engines")} in ${countOf(envCount, "Umgebung", "Umgebungen")}. Wähl eine Umgebung und dann eine Engine, oder analysiere alle zusammen.`,
  "cockpit.landing.env.count": ({ count }) => countOf(count, "Engine", "Engines"),
  "cockpit.landing.env.back": "Alle Umgebungen",
  "cockpit.landing.subtitle.noFleet": ({ count }) =>
    `${countOf(count, "Engine", "Engines")} konfiguriert. Wähl eine Engine.`,
  "cockpit.landing.subtitle.env.noFleet": ({ count, envCount }) =>
    `${countOf(count, "Engine", "Engines")} in ${countOf(envCount, "Umgebung", "Umgebungen")}. Wähl eine Umgebung und dann eine Engine.`,
  "cockpit.landing.engine.incidents": ({ count }) => countOf(count, "Incident", "Incidents"),
  "cockpit.landing.engine.noStatus": "Zustand nicht abrufbar",
  "cockpit.landing.operate.title": "Mit einer Engine arbeiten",
  "cockpit.landing.operate.desc": "Übersicht, Incidents und Details einer Engine.",
  "cockpit.landing.fleet.title": "Engine-übergreifende Analysen",
  "cockpit.landing.fleet.desc":
    "Zustand jeder Engine, Vergleich je Prozess und Analysen von Fehlern und Performance über alle Engines.",
  "cockpit.landing.fleet.open": "Engine-übergreifende Übersicht öffnen",
  "cockpit.crumb.cockpit": "Cockpit",
  "cockpit.crumb.fleet": "Alle Engines",
  "cockpit.engineGone": ({ engineId }) =>
    `Engine ${String(engineId)} ist nicht mehr in deiner Engine-Liste.`,

  // ── Profil-/Einstellungs-Panel ──────────────────────────────────────────────
  "profile.heading": "Profil & Einstellungen",
  "profile.subtitle": "Deine Engines, Sprache, Darstellung und Dashboards.",
  "profile.save": "Speichern",
  "profile.saving": "Wird gespeichert…",
  "profile.saved": ({ time }) => `Gespeichert um ${String(time)}`,
  "profile.saveError":
    "Das Profil konnte nicht gespeichert werden. Deine Eingaben sind noch da, versuch es noch mal.",
  "profile.readOnly":
    "Diese Verbindung darf keine Einstellungen speichern. Ändern kann sie nur eine Verbindung mit Schreibrechten.",
  "profile.loading": "Wird geladen…",
  "profile.none": "Kein Profil verfügbar",

  "profile.section.appearance": "Sprache & Darstellung",
  "profile.section.engines": "Engines",
  "profile.section.dashboards": "Dashboards",

  "profile.field.language": "Sprache",
  "profile.field.language.help":
    "„Automatisch“ übernimmt die Sprache deiner Chat-App. Eine feste Sprache gilt auch für das, was die Tools der AI zurückmelden.",
  "profile.field.theme": "Darstellung",
  "profile.field.role": "Bevorzugte Rolle",
  "profile.field.role.help": "Nur ein Hinweis. Was du darfst, legt deine Verbindung fest.",
  "profile.role.unset": "(nicht gesetzt)",

  "profile.field.allowedEngines": "Verfügbare Engines",
  "profile.field.allowedEngines.help":
    "Diese Engines stehen in deinen Auswahllisten. Ohne Haken stehen alle drin. Deine Rechte ändert das nicht.",
  "profile.engines.none": "Keine Engines konfiguriert.",
  "profile.field.defaultEngine": "Standard-Engine",
  "profile.field.defaultEngine.help":
    "Diese Engine nutzen die Tools und das Cockpit, wenn du keine andere wählst.",
  "profile.engine.auto": "(automatisch)",

  "profile.dashboards.unavailable":
    "Gespeicherte Dashboards sind nicht verfügbar. Dafür braucht der Server eine Anmeldung und muss Änderungen erlauben. Bitte deine Administration, das einzurichten.",
  "profile.dashboards.empty":
    "Noch keine Dashboards gespeichert. Lass dir im Chat eins bauen und speichere es.",
  "profile.field.defaultDashboard": "Standard-Dashboard",
  "profile.field.defaultDashboard.help":
    "Dieses Dashboard schlägt die AI als Erstes vor (load-dashboard).",
  "profile.dashboard.none": "(keins)",
  "profile.field.pinnedDashboards": "Angepinnte Dashboards",
  "profile.field.pinnedDashboards.help": "Stehen in Dashboard-Auswahlen oben.",

  "profile.summary": ({ language, theme, engines, defaultDashboard }) =>
    `Benutzerprofil: Sprache ${String(language)}, Theme ${String(theme)}, ${String(engines)}${String(defaultDashboard)}.`,
  "profile.summary.allEngines": "alle Engines",
  "profile.summary.someEngines": ({ count }) =>
    countOf(count, "erlaubte Engine", "erlaubte Engines"),
  "profile.summary.defaultDashboard": ({ id }) =>
    `, Standard-Dashboard „${String(id)}" (öffnen mit load-dashboard)`,

  // ── Aufzählungs-Optionen ────────────────────────────────────────────────────
  "theme.light": "Hell",
  "theme.dark": "Dunkel",
  "theme.system": "System",
  "language.system": "Automatisch (wie die Chat-App)",
  "role.read-only": "Nur lesen",
  "role.operations": "Betrieb",
  "role.admin": "Administration",

  // ── Ansichtstitel der Show-Tools (Werkzeugleiste des Hosts) ─────────────────
  "viewTitle.cockpit": "Cockpit",
  "viewTitle.processList": "Prozessdefinitionen",
  "viewTitle.processInstances": "Laufende Instanzen",
  "viewTitle.historyTimeline": "Verlauf",
  "viewTitle.instanceDetail": "Prozessinstanz",
  "viewTitle.bpmnViewer": "BPMN-Diagramm",
  "viewTitle.jobPanel": "Jobs",
  "viewTitle.engineHealth": "Engine-Übersicht",
  "viewTitle.userProfile": "Profil & Einstellungen",
  "viewTitle.clusterDetail": ({ activity }) => `Cluster: ${String(activity)}`,

  // ── Modellseitige Widget-Tool-Zusammenfassungen (c7sum.*) ────────────────────
  "c7sum.cockpitOpened":
    'Das Operations Cockpit wurde auf Engine "{engineId}" geöffnet ({engineCount} Engine(s) in der Engine-Liste des Benutzers). Der Benutzer kann die Prozesslandschaft von hier aus clientseitig navigieren.',
  "c7sum.cockpitOpenedPicker":
    "Das Operations Cockpit wurde auf seiner Engine-Auswahl geöffnet: {engineCount} Engine(s) in der Engine-Liste des Benutzers, keine vorausgewählt (kein `engine` übergeben, kein gespeicherter Standard). Der Benutzer wählt eine; mit `engine` öffnet es direkt auf einer bestimmten Engine.",
  "c7sum.processList":
    'Prozessliste: {totalCount} bereitgestellte Definition(en){filters} auf Engine "{engineId}".',
  "c7sum.state.active": "läuft",
  "c7sum.state.suspended": "ausgesetzt",
  "c7sum.state.ended": "beendet",
  "c7sum.instanceDetail":
    "Prozessinstanz {instanceId}{businessKey}: {state}; laufende Aktivitäten: {activeActivities}, offene Incidents: {openIncidents}, offene Benutzeraufgaben: {openTasks}.",
  "c7sum.processInstances":
    '{totalCount} laufende Instanz(en) von "{processDefinitionKey}", davon {withIncidentCount} mit Incidents und {suspendedCount} ausgesetzt; {returnedCount} in der Tabelle angezeigt.',
  "c7sum.incidentsDashboard":
    "Incident-Übersicht: {totalCount} offene Incident(s) in {processCount} Prozessdefinition(en), {last24hCount} in den letzten 24 Stunden.",
  "c7sum.processIncidents":
    'Incidents des Prozesses "{processDefinitionKey}" (alle Versionen; Diagramm v{diagramVersion}): {incidentCount} offene Incident(s), betroffene Aktivitäten: {activities}, {last24hCount} in den letzten 24 Stunden.',
  "c7sum.incidentDetail":
    'Incident {incidentId} ({incidentType}) bei Aktivität "{activity}" in "{processDefinitionKey}", Instanz {processInstanceId}{message}.',
  "c7sum.processDetail":
    'Prozess "{processDefinitionKey}" (alle Versionen; Diagramm v{diagramVersion}): {runningInstances} laufende Instanz(en), {openIncidents} offene Incident(s), {failedJobs} fehlgeschlagene(r) Job(s).',
  "c7sum.historyTimeline":
    "Verlaufs-Zeitleiste für Prozessinstanz {processInstanceId}: historische Aktivitäten: {totalActivities}{notFound}.",
  "c7sum.historyTimeline.notFound": " (keine historische Prozessinstanz gefunden)",
  "c7sum.engineHealth":
    'Engine "{engineId}": {status} ({rule}). Offene Incidents: {totalIncidents}, betroffene Aktivitäten: {affectedActivities}, laufende Instanzen: {runningInstances}.{topCluster}',
  "c7sum.engineHealth.topCluster":
    ' Größter Cluster: Aktivität "{activityId}" / {incidentType}, Incidents: {incidentCount}.',
  "c7sum.engineHealth.noIncidents": " Keine offenen Incidents.",
  "c7sum.unknownNumberOf": "unbekannt viele",
  "c7sum.atLeast": "mindestens {count}",
  "c7sum.unknown": "unbekannt",
  "c7sum.clusterDetail":
    'Fehler-Cluster auf Engine "{engineId}": Aktivität "{activityId}" / {incidentType}. Incidents: {incidentCount} ({lastHourCount} in der letzten Stunde), Prozesse: {processes}.{sample}',
  "c7sum.clusterDetail.unknownProcesses": "unbekannte Prozesse",
  "c7sum.clusterDetail.sample": " Beispiel: {message}",
  "c7sum.bpmnViewer":
    "Das BPMN-Diagramm für {target}{overlayInfo}{xmlUnavailable} wurde gerendert.",
  "c7sum.bpmnViewer.empty":
    "BPMN-Viewer: Keine passende Prozessdefinition gefunden, das Diagramm ist leer.",
  "c7sum.bpmnViewer.targetInstance": "Prozessinstanz {processInstanceId}",
  "c7sum.bpmnViewer.targetDefinition": "Prozessdefinition {definitionId}",
  "c7sum.bpmnViewer.overlays":
    "; laufende Aktivitäten: {activeActivities}, Aktivitäten mit Incidents: {incidentActivities}, fehlgeschlagene Jobs dieser Instanz: {failedJobs}",
  "c7sum.bpmnViewer.noOverlays":
    " (keine Instanz-Overlays; die Badges zählen alle laufenden Instanzen dieser Version)",
  "c7sum.bpmnViewer.xmlUnavailable": "; Diagramm-XML nicht verfügbar",
  "c7sum.jobPanel":
    "Job-Panel: {totalCount} Job(s), {failedCount} fehlgeschlagen{forProcess}{failedOnly}.",
  "c7sum.jobPanel.forProcess": ' für "{processDefinitionKey}"',
  "c7sum.jobPanel.failedOnly": " (nur fehlgeschlagene)",
}
