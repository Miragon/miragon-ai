import type { AppDefinition } from "@miragon/mcp-toolkit-core"
import {
  loadProcessDefinitionsStep,
  loadTasksStep,
  loadProcessInstanceStep,
  loadIncidentsDashboardStep,
  loadProcessIncidentsStep,
  loadHistoryTimelineStep,
  loadCockpitDashboardStep,
  loadBpmnViewerStep,
  loadDeploymentsStep,
  loadJobsStep,
} from "./steps/index.js"

export const definition: AppDefinition = {
  name: "camunda7",
  steps: [
    loadProcessDefinitionsStep,
    loadTasksStep,
    loadProcessInstanceStep,
    loadIncidentsDashboardStep,
    loadProcessIncidentsStep,
    loadHistoryTimelineStep,
    loadCockpitDashboardStep,
    loadBpmnViewerStep,
    loadDeploymentsStep,
    loadJobsStep,
  ],
  widgets: [
    {
      id: "camunda7:process-list",
      requires: [],
      size: "full",
    },
    {
      id: "camunda7:task-dashboard",
      requires: ["camunda7:tasks"],
      size: "full",
    },
    {
      id: "camunda7:instance-detail",
      requires: ["camunda7:instance"],
      size: "full",
    },
    {
      id: "camunda7:incidents-dashboard",
      requires: ["camunda7:incidentsDashboardData"],
      size: "full",
    },
    {
      id: "camunda7:process-incidents",
      requires: ["camunda7:processIncidentsData"],
      size: "full",
    },
    {
      id: "camunda7:history-timeline",
      requires: ["camunda7:historyProcessInstance", "camunda7:historyActivities"],
      size: "full",
    },
    {
      id: "camunda7:cockpit-dashboard",
      requires: ["camunda7:cockpitDashboardData"],
      size: "full",
    },
    {
      id: "camunda7:bpmn-viewer",
      requires: ["camunda7:bpmnViewerData"],
      size: "full",
    },
    {
      id: "camunda7:deployment-browser",
      requires: ["camunda7:deploymentsData"],
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
