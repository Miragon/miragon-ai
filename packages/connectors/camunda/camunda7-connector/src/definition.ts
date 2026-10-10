import { z } from "zod"
import type { AppDefinition } from "@miragon/mcp-toolkit-core"
import {
  loadProcessDefinitionsStep,
  loadProcessInstanceStep,
  loadIncidentsDashboardStep,
  loadProcessIncidentsStep,
  loadHistoryTimelineStep,
  loadCockpitDashboardStep,
  loadBpmnViewerStep,
  loadJobsStep,
} from "./steps/index.js"
import { processInstancesFilterShape } from "./feed-contracts.js"

const processListPropsSchema = z.toJSONSchema(
  z.object({
    processDefinitionKey: z
      .string()
      .optional()
      .describe("Filter to an exact process definition key."),
    nameLike: z.string().optional().describe("Filter by partial process definition name."),
    latestVersion: z
      .boolean()
      .optional()
      .describe("Restrict to the latest version of each definition (default `true`)."),
  }),
)

const bpmnViewerPropsSchema = z.toJSONSchema(
  z.object({
    processInstanceId: z
      .string()
      .optional()
      .describe(
        "Render the diagram with the running instance's OWN overlays: its active activities, incidents, tokens and failed jobs.",
      ),
    processDefinitionKey: z
      .string()
      .optional()
      .describe(
        "Render the diagram of a process definition version; its badges count every running instance of that version. Combine with `version` to pin a specific revision.",
      ),
    version: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Specific definition version. Requires `processDefinitionKey`. Defaults to latest.",
      ),
    engine: z
      .string()
      .optional()
      .describe("Engine id. Omitted → saved default engine or single default."),
  }),
)

const activityIncidentListPropsSchema = z.toJSONSchema(
  z.object({
    emptyVariant: z
      .enum(["siblings", "note"])
      .optional()
      .describe(
        'No-incidents rendering: "note" (slim success note, default) or "siblings" (offer other processes with open incidents).',
      ),
  }),
)

const processInstancesPropsSchema = z.toJSONSchema(
  z.object({
    processDefinitionKey: z.string().describe("Process definition key whose instances to list."),
    active: processInstancesFilterShape.active,
    suspended: processInstancesFilterShape.suspended,
    withIncidents: processInstancesFilterShape.withIncidents,
    businessKeyLike: processInstancesFilterShape.businessKeyLike,
  }),
)

const incidentDetailPropsSchema = z.toJSONSchema(
  z.object({
    incidentId: z.string().describe("The incident ID to inspect."),
  }),
)

const engineHealthPropsSchema = z.toJSONSchema(
  z.object({
    engine: z
      .string()
      .optional()
      .describe(
        "Engine id to assess. Omitted → the caller's saved default engine or the single configured engine.",
      ),
  }),
)

const clusterDetailPropsSchema = z.toJSONSchema(
  z.object({
    activityId: z.string().describe("Activity id of the failure cluster."),
    incidentType: z.string().describe('Incident type of the cluster, e.g. "failedJob".'),
    messageSignature: z
      .string()
      .optional()
      .describe(
        "Normalized failure-message signature from the overview cluster (optional filter).",
      ),
    engine: z
      .string()
      .optional()
      .describe("Engine id. Omitted → saved default engine or single default."),
  }),
)

export const definition: AppDefinition = {
  name: "camunda7",
  steps: [
    loadProcessDefinitionsStep,
    loadProcessInstanceStep,
    loadIncidentsDashboardStep,
    loadProcessIncidentsStep,
    loadHistoryTimelineStep,
    loadCockpitDashboardStep,
    loadBpmnViewerStep,
    loadJobsStep,
  ],
  widgets: [
    {
      id: "camunda7:process-list",
      description:
        "Deployed process definitions (latest version of each by default) with search and the exact total.",
      consumes: ["camunda7:processDefinitionList"],
      requires: [],
      size: "full",
      propsSchema: processListPropsSchema,
    },
    {
      id: "camunda7:instance-detail",
      description:
        "One running process instance: state, open user tasks and incidents (exact totals), variables, history, diagram.",
      consumes: ["camunda7:processInstance"],
      requires: ["camunda7:instance"],
      size: "full",
    },
    {
      id: "camunda7:incident-overview-kpi",
      description:
        "Open-incident KPIs across all definitions: exact total, affected processes, last 24h.",
      consumes: ["camunda7:incidentsDashboard"],
      requires: ["camunda7:incidentsDashboardData"],
      size: "full",
    },
    {
      id: "camunda7:incident-process-list",
      description:
        "Open incidents per definition key (all versions, exact counts); each card's activity breakdown covers its newest incidents.",
      consumes: ["camunda7:incidentsDashboard"],
      requires: ["camunda7:incidentsDashboardData"],
      size: "full",
    },
    {
      id: "camunda7:process-detail-header",
      description:
        "Header of the definition view of one key (all versions): running instances, latest incident, AI analysis.",
      consumes: ["camunda7:processIncidents"],
      requires: ["camunda7:processIncidentsData"],
      size: "full",
    },
    {
      id: "camunda7:process-definition-kpi",
      description:
        "KPI strip of one definition key over all its versions: running instances, open incidents, last 24h, failed jobs.",
      consumes: ["camunda7:processIncidents"],
      requires: ["camunda7:processIncidentsData"],
      size: "full",
    },
    {
      id: "camunda7:process-definition-flow",
      description:
        "The key's latest diagram, leading with incident overlays summed over all versions; the execution heatmap modes join once analytics is active.",
      consumes: ["camunda7:processIncidents"],
      requires: ["camunda7:processIncidentsData"],
      size: "full",
    },
    {
      id: "camunda7:activity-incident-list",
      description:
        "One key's open incidents grouped by activity (exact counts over all versions); each group pages its incidents.",
      consumes: ["camunda7:processIncidents"],
      requires: ["camunda7:processIncidentsData"],
      size: "full",
      propsSchema: activityIncidentListPropsSchema,
    },
    {
      // Self-fetching: loads camunda7_incident_detail_data for the given
      // incidentId (no pipeline step), like its camunda7_show_incident_detail tool.
      id: "camunda7:incident-detail",
      description:
        "One incident: failure and stacktrace, its instance's state and variables, the diagram, and the recovery it allows.",
      requires: [],
      size: "full",
      propsSchema: incidentDetailPropsSchema,
    },
    {
      id: "camunda7:history-timeline",
      description:
        "The activity history of one process instance as a timeline (paged, exact total).",
      consumes: ["camunda7:historyTimeline"],
      requires: ["camunda7:historyProcessInstance", "camunda7:historyActivities"],
      size: "full",
    },
    {
      // Self-fetching: loads camunda7_engine_health_data for the engine (no
      // pipeline step), eager-rendered by camunda7_show_engine_health.
      id: "camunda7:engine-health",
      description:
        "The engine verdict from its open incidents (rule stated), exact totals and the top failure clusters.",
      requires: [],
      size: "full",
      propsSchema: engineHealthPropsSchema,
    },
    {
      // Self-fetching: loads camunda7_cluster_detail_data for one failure
      // cluster (no pipeline step), eager-rendered by camunda7_show_cluster_detail.
      id: "camunda7:cluster-detail",
      description:
        "One failure cluster (activity, incident type, message): its KPIs and the affected instances.",
      requires: [],
      size: "full",
      propsSchema: clusterDetailPropsSchema,
    },
    {
      id: "camunda7:process-health-kpi",
      description:
        "Landscape KPIs over all definition keys: definitions, running instances, failed jobs, open incidents.",
      consumes: ["camunda7:cockpitDashboard"],
      requires: ["camunda7:cockpitDashboardData"],
      size: "full",
    },
    {
      id: "camunda7:process-definitions-table",
      description:
        "One row per definition key: running instances, failed jobs and incidents summed over all versions.",
      consumes: ["camunda7:cockpitDashboard"],
      requires: ["camunda7:cockpitDashboardData"],
      size: "full",
    },
    {
      // Self-fetching: loads camunda7_process_instances_data for the given
      // processDefinitionKey (no pipeline step).
      id: "camunda7:process-instances",
      description:
        "Running process instances (filterable, paged) with exact totals and per-row incident flags.",
      requires: [],
      size: "full",
      propsSchema: processInstancesPropsSchema,
    },
    {
      id: "camunda7:bpmn-viewer",
      description:
        "A BPMN diagram: a running instance with its own tokens, incidents and failed jobs, or a definition version.",
      consumes: ["camunda7:bpmnViewer"],
      requires: [],
      size: "full",
      propsSchema: bpmnViewerPropsSchema,
    },
    {
      id: "camunda7:bpmn-viewer-header",
      description:
        "Header of the BPMN viewer: the instance, its active and incident activity counts, AI analysis.",
      consumes: ["camunda7:bpmnViewer"],
      requires: ["camunda7:bpmnViewerData"],
      size: "full",
    },
    {
      id: "camunda7:bpmn-viewer-legend",
      description: "Legend of the BPMN viewer's overlays, naming whose counts the badges show.",
      consumes: ["camunda7:bpmnViewer"],
      requires: ["camunda7:bpmnViewerData"],
      size: "full",
    },
    {
      id: "camunda7:bpmn-flow-viewer",
      description: "The BPMN viewer's canvas with token, incident and failed-job overlays.",
      consumes: ["camunda7:bpmnViewer"],
      requires: ["camunda7:bpmnViewerData"],
      size: "full",
    },
    {
      id: "camunda7:job-panel",
      description: "Jobs (paged) with the exact totals of all and of failed jobs.",
      consumes: ["camunda7:jobPanel"],
      requires: ["camunda7:jobPanelData"],
      size: "full",
    },
    {
      // Self-fetching: loads camunda7_user_profile_data for the signed-in caller
      // (no pipeline step), eager-rendered by camunda7_show_user_profile.
      id: "camunda7:user-profile",
      description:
        "The signed-in user's settings (language, theme, default engine) — opened by camunda7_show_user_profile.",
      requires: [],
      size: "full",
    },
    {
      // Consolidated client-side cockpit app (camunda7_open_cockpit). Bootstraps
      // itself from camunda7_list_engines and the per-view data feeds.
      id: "camunda7:cockpit-app",
      description:
        "The whole navigable cockpit — opened by camunda7_open_cockpit, not composed into a view.",
      requires: [],
      size: "full",
    },
  ],
}
