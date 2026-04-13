import type { AppDefinition } from "@miragon/mcp-toolkit-core"
import {
  loadProcessDefinitionsStep,
  loadTasksStep,
  loadProcessInstanceStep,
  loadIncidentPanelStep,
  loadHistoryTimelineStep,
} from "./steps/index.js"

export const definition: AppDefinition = {
  name: "camunda7",
  steps: [
    loadProcessDefinitionsStep,
    loadTasksStep,
    loadProcessInstanceStep,
    loadIncidentPanelStep,
    loadHistoryTimelineStep,
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
      id: "camunda7:incident-panel",
      requires: ["camunda7:incidentPanelData"],
      size: "full",
    },
    {
      id: "camunda7:history-timeline",
      requires: ["camunda7:historyProcessInstance", "camunda7:historyActivities"],
      size: "full",
    },
  ],
}

export default definition
