import type { AppDefinition } from "@miragon/mcp-toolkit-core"
import {
  loadTasksStep,
  loadProcessInstanceStep,
  loadIncidentPanelStep,
  loadHistoryTimelineStep,
  loadCockpitDashboardStep,
  loadBpmnViewerStep,
  loadJobsStep,
} from "./steps/index.js"

export const definition: AppDefinition = {
  name: "camunda7",
  steps: [
    loadTasksStep,
    loadProcessInstanceStep,
    loadIncidentPanelStep,
    loadHistoryTimelineStep,
    loadCockpitDashboardStep,
    loadBpmnViewerStep,
    loadJobsStep,
  ],
  widgets: [
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
      id: "camunda7:incident-panel",
      requires: ["camunda7:incidentPanelData"],
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
      id: "camunda7:job-panel",
      requires: ["camunda7:jobPanelData"],
      size: "full",
    },
    {
      id: "camunda7:developer-workbench",
      requires: [],
      size: "full",
    },
    {
      id: "camunda7:ops-console",
      requires: [],
      size: "full",
    },
  ],
}

export default definition
