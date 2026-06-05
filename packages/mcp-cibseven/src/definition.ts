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
      id: "camunda7:history-timeline",
      requires: ["camunda7:historyProcessInstance", "camunda7:historyActivities"],
      size: "full",
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
  ],
}

export default definition
