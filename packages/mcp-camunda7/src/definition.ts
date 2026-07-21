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
        "Render the diagram with live overlays (active activities, incidents, failed-job counts) for a running instance.",
      ),
    processDefinitionKey: z
      .string()
      .optional()
      .describe(
        "Render the static diagram of a process definition (no instance overlays). Combine with `version` to pin a specific revision.",
      ),
    version: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Specific definition version. Requires `processDefinitionKey`. Defaults to latest.",
      ),
  }),
)

const processDetailPropsSchema = z.toJSONSchema(
  z.object({
    processDefinitionKey: z.string().describe("Process definition key to display."),
  }),
)

const processInstancesPropsSchema = z.toJSONSchema(
  z.object({
    processDefinitionKey: z.string().describe("Process definition key whose instances to list."),
    active: z.boolean().optional().describe("Only running (non-suspended) instances."),
    suspended: z.boolean().optional().describe("Only suspended instances."),
    withIncidentsOnly: z
      .boolean()
      .optional()
      .describe("Only instances that currently have an open incident."),
    businessKeyLike: z.string().optional().describe("Filter by a substring of the business key."),
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
        "Engine id to assess. Omitted → the session's sticky selection or the single configured engine.",
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
      .describe("Engine id. Omitted → sticky selection or single default."),
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
      requires: [],
      size: "full",
      propsSchema: processListPropsSchema,
    },
    {
      id: "camunda7:instance-detail",
      requires: ["camunda7:instance"],
      size: "full",
    },
    {
      id: "camunda7:incident-overview-kpi",
      requires: ["camunda7:incidentsDashboardData"],
      size: "full",
    },
    {
      id: "camunda7:incident-process-list",
      requires: ["camunda7:incidentsDashboardData"],
      size: "full",
    },
    {
      id: "camunda7:process-detail-header",
      requires: ["camunda7:processIncidentsData"],
      size: "full",
    },
    {
      id: "camunda7:process-incident-kpi",
      requires: ["camunda7:processIncidentsData"],
      size: "full",
    },
    {
      id: "camunda7:process-incident-flow",
      requires: ["camunda7:processIncidentsData"],
      size: "full",
    },
    {
      id: "camunda7:activity-incident-list",
      requires: ["camunda7:processIncidentsData"],
      size: "full",
    },
    {
      // Self-fetching: loads camunda7_incident_detail_data for the given
      // incidentId (no pipeline step), like its camunda7_show_incident_detail tool.
      id: "camunda7:incident-detail",
      requires: [],
      size: "full",
      propsSchema: incidentDetailPropsSchema,
    },
    {
      id: "camunda7:history-timeline",
      requires: ["camunda7:historyProcessInstance", "camunda7:historyActivities"],
      size: "full",
    },
    {
      // Self-fetching: loads camunda7_engine_health_data for the engine (no
      // pipeline step), eager-rendered by camunda7_show_engine_health.
      id: "camunda7:engine-health",
      requires: [],
      size: "full",
      propsSchema: engineHealthPropsSchema,
    },
    {
      // Self-fetching: loads camunda7_cluster_detail_data for one failure
      // cluster (no pipeline step), eager-rendered by camunda7_show_cluster_detail.
      id: "camunda7:cluster-detail",
      requires: [],
      size: "full",
      propsSchema: clusterDetailPropsSchema,
    },
    {
      id: "camunda7:process-health-kpi",
      requires: ["camunda7:cockpitDashboardData"],
      size: "full",
    },
    {
      id: "camunda7:process-definitions-table",
      requires: ["camunda7:cockpitDashboardData"],
      size: "full",
    },
    {
      // Self-fetching: loads camunda7_process_detail_data for the given
      // processDefinitionKey (no pipeline step).
      id: "camunda7:process-detail",
      requires: [],
      size: "full",
      propsSchema: processDetailPropsSchema,
    },
    {
      // Self-fetching: loads camunda7_process_instances_data for the given
      // processDefinitionKey (no pipeline step).
      id: "camunda7:process-instances",
      requires: [],
      size: "full",
      propsSchema: processInstancesPropsSchema,
    },
    {
      id: "camunda7:bpmn-viewer",
      requires: [],
      size: "full",
      propsSchema: bpmnViewerPropsSchema,
    },
    {
      id: "camunda7:bpmn-viewer-header",
      requires: ["camunda7:bpmnViewerData"],
      size: "full",
    },
    {
      id: "camunda7:bpmn-viewer-legend",
      requires: ["camunda7:bpmnViewerData"],
      size: "full",
    },
    {
      id: "camunda7:bpmn-flow-viewer",
      requires: ["camunda7:bpmnViewerData"],
      size: "full",
    },
    {
      id: "camunda7:job-panel",
      requires: ["camunda7:jobPanelData"],
      size: "full",
    },
    {
      // Self-fetching: loads camunda7_user_profile_data for the current session
      // (no pipeline step), eager-rendered by camunda7_show_user_profile.
      id: "camunda7:user-profile",
      requires: [],
      size: "full",
    },
    {
      // Consolidated client-side cockpit app (camunda7_open_cockpit). Bootstraps
      // itself from camunda7_engine (action "list") and the per-view data feeds.
      id: "camunda7:cockpit-app",
      requires: [],
      size: "full",
    },
  ],
}

export default definition
