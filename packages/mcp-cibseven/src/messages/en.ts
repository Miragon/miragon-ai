import type { MessageCatalog } from "@miragon/mcp-toolkit-core"

/**
 * English message catalog — the fallback locale. Every key MUST exist here so
 * the translator's `requested → fallback(en) → key` chain always lands on a real
 * string. Keys are dotted by surface (`cockpit.*`, `profile.*`, `theme.*`,
 * `role.*`).
 */
export const en: MessageCatalog = {
  // ── Cockpit shell ──────────────────────────────────────────────────────────
  "cockpit.section.overview": "Overview",
  "cockpit.section.incidents": "Incidents",
  "cockpit.section.settings": "Settings",
  "cockpit.crumb.overview": "Overview",
  "cockpit.crumb.incidents": "Incidents",
  "cockpit.crumb.instances": "Instances",
  "cockpit.crumb.instance": ({ id }) => `Instance ${String(id)}…`,
  "cockpit.crumb.incident": ({ id }) => `Incident ${String(id)}…`,
  "cockpit.crumb.cluster": ({ activity }) => `Cluster: ${String(activity)}`,
  "cockpit.loading.engines": "Loading engines…",
  "cockpit.empty.engines": "No CIB Seven engines configured.",
  "cockpit.nav.crossEngine": "Cross-engine",
  "cockpit.nav.engine": "Engine",
  "cockpit.landing.title": "CIB Seven Cockpit",
  "cockpit.landing.subtitle": ({ count }) =>
    `${String(count)} engines configured — operate one engine, or analyze across the whole fleet.`,
  "cockpit.landing.operate.title": "Operate an engine",
  "cockpit.landing.operate.desc": "Overview, incidents and drill-downs for one engine.",
  "cockpit.landing.fleet.title": "Cross-engine analyses",
  "cockpit.landing.fleet.desc":
    "Fleet health across all engines, engine comparison, and fleet-wide failure & performance analysis.",
  "cockpit.landing.fleet.open": "Open fleet view",
  "cockpit.crumb.cockpit": "Cockpit",
  "cockpit.crumb.fleet": "Fleet",

  // ── Profile / settings panel ────────────────────────────────────────────────
  "profile.heading": "Profile & Settings",
  "profile.subtitle":
    "Preferences for this session — engine availability, language, theme, dashboards and analytics defaults.",
  "profile.save": "Save",
  "profile.saving": "Saving…",
  "profile.saved": ({ time }) => `Saved ${String(time)}`,
  "profile.saveError": "Failed to save profile.",
  "profile.loading": "Loading…",
  "profile.none": "No profile available",

  "profile.section.appearance": "Language & appearance",
  "profile.section.engines": "Engines",
  "profile.section.dashboards": "Dashboards",
  "profile.section.analytics": "Analytics defaults",

  "profile.field.language": "Language",
  "profile.field.language.help":
    "UI language. Also steers the language of tool summaries returned to the model.",
  "profile.field.theme": "Theme",
  "profile.field.role": "Preferred role",
  "profile.field.role.help": "Hint only — tool access is set by the connection.",
  "profile.role.unset": "(unset)",

  "profile.field.allowedEngines": "Available engines",
  "profile.field.allowedEngines.help":
    "Which engines you can pick from. Uncheck all to allow every engine. Curation, not access control.",
  "profile.engines.none": "No engines configured.",
  "profile.field.defaultEngine": "Default engine",
  "profile.field.defaultEngine.help": "The engine the cockpit opens on.",
  "profile.engine.auto": "(auto)",

  "profile.dashboards.unavailable": "Saved dashboards are unavailable.",
  "profile.dashboards.empty": "No saved dashboards yet.",
  "profile.field.defaultDashboard": "Default dashboard",
  "profile.field.defaultDashboard.help": "Opened first when you enter the cockpit.",
  "profile.dashboard.none": "(none)",
  "profile.field.pinnedDashboards": "Pinned dashboards",
  "profile.field.pinnedDashboards.help": "Shown first in dashboard pickers.",

  "profile.field.analyticsPeriod": "Default period",
  "profile.field.analyticsPeriod.help": "Default look-back window for analytics.",
  "profile.field.minBucket": "Min bucket size",
  "profile.field.minBucket.help": "Minimum activity-bucket size for aggregation.",

  "profile.summary": ({ language, theme, engines, period }) =>
    `User profile: language ${String(language)}, theme ${String(theme)}, ${String(engines)}, analytics window ${String(period)}.`,
  "profile.summary.allEngines": "all engines",
  "profile.summary.someEngines": ({ count }) => `${String(count)} allowed engine(s)`,

  // ── Enumerated option labels ────────────────────────────────────────────────
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "System",
  "role.read-only": "Read-only",
  "role.operations": "Operations",
  "role.admin": "Admin",

  // ── Model-facing widget-tool summaries (c7sum.*) ─────────────────────────────
  "c7sum.cockpitOpened":
    'Opened the CIB Seven cockpit on engine "{engineId}" ({engineCount} engine(s) configured). The user can navigate the process landscape client-side from here.',
  "c7sum.cockpitOpenedPicker":
    "Opened the CIB Seven cockpit with an engine picker ({engineCount} engines configured, none selected).",
  "c7sum.processList":
    'Process list: {totalCount} deployed definition(s){filters} on engine "{engineId}".',
  "c7sum.state.active": "active",
  "c7sum.state.suspended": "suspended",
  "c7sum.state.ended": "ended",
  "c7sum.instanceDetail":
    "Process instance {instanceId}{businessKey}: {state}, {activeActivities} active activities, {openIncidents} open incidents, {openTasks} open user tasks.",
  "c7sum.processInstances":
    '{totalCount} running instance(s) of "{processDefinitionKey}" ({withIncidentCount} with incidents, {suspendedCount} suspended); showing {returnedCount} in the table.',
  "c7sum.incidentsDashboard":
    "Incidents dashboard: {totalCount} open incident(s) across {processCount} process definition(s), {last24hCount} in the last 24h.",
  "c7sum.processIncidents":
    'Process incidents for "{processDefinitionKey}"{version}: {incidentCount} open incident(s) across {activities} activities, {last24hCount} in the last 24h.',
  "c7sum.incidentDetail":
    'Incident {incidentId} ({incidentType}) at activity "{activity}" in "{processDefinitionKey}", instance {processInstanceId}{message}.',
  "c7sum.processDetail":
    'Process "{processDefinitionKey}"{version}: {runningInstances} running instance(s), {openIncidents} open incident(s), {failedJobs} failed job(s).',
  "c7sum.historyTimeline":
    "History timeline for process instance {processInstanceId}: {totalActivities} historic activities{notFound}.",
  "c7sum.historyTimeline.notFound": " (no historic process instance found)",
  "c7sum.cockpitDashboard":
    'Cockpit dashboard for engine "{engineId}": {totalDefinitions} definitions, {totalRunningInstances} running instances, {totalFailedJobs} failed jobs, {totalIncidents} open incidents.',
  "c7sum.engineHealth":
    'Engine "{engineId}" — {status}: {totalIncidents} open incidents across {affectedActivities} activities, {runningInstances} running instances.{topCluster}',
  "c7sum.engineHealth.topCluster":
    ' Top cluster: activity "{activityId}" / {incidentType}, {incidentCount} incidents.',
  "c7sum.engineHealth.noIncidents": " No open incidents.",
  "c7sum.clusterDetail":
    'Failure cluster on engine "{engineId}": activity "{activityId}" / {incidentType} — {incidentCount} incidents ({lastHourCount} in the last hour) across {processes}.{sample}',
  "c7sum.clusterDetail.unknownProcesses": "unknown processes",
  "c7sum.clusterDetail.sample": " Sample: {message}",
  "c7sum.bpmnViewer": "Rendered the BPMN diagram for {target}{overlayInfo}{xmlUnavailable}.",
  "c7sum.bpmnViewer.empty":
    "BPMN viewer: no matching process definition found — rendered an empty diagram.",
  "c7sum.bpmnViewer.targetInstance": "process instance {processInstanceId}",
  "c7sum.bpmnViewer.targetDefinition": "process definition {definitionId}",
  "c7sum.bpmnViewer.overlays":
    ": {activeActivities} active activities, {incidentActivities} activities with incidents, {failedJobs} failed jobs",
  "c7sum.bpmnViewer.noOverlays": " (static diagram, no instance overlays)",
  "c7sum.bpmnViewer.xmlUnavailable": " — diagram XML unavailable",
  "c7sum.jobPanel": "Job panel: {totalCount} job(s), {failedCount} failed{forProcess}{failedOnly}.",
  "c7sum.jobPanel.forProcess": ' for "{processDefinitionKey}"',
  "c7sum.jobPanel.failedOnly": " (failed only)",
}
