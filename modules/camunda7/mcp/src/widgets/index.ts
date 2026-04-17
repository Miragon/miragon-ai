import type { ComponentType } from "react"
import { IncidentPanelWidget, type IncidentPanelData } from "./incident-panel.js"
import { HistoryTimelineWidget, type HistoryTimelineData } from "./history-timeline.js"
import { TaskDashboardWidget, type TaskDashboardData } from "./task-dashboard.js"
import { InstanceDetailWidget, type InstanceDetailData } from "./instance-detail.js"
import { CockpitDashboardWidget, type CockpitDashboardData } from "./cockpit-dashboard.js"
import { BpmnViewerWidget, type BpmnViewerData } from "./bpmn-viewer.js"
import { JobPanelWidget, type JobPanelData } from "./job-panel.js"
import { DeveloperWorkbenchWidget, type DeveloperWorkbenchData } from "./developer-workbench.js"
import { OpsConsoleWidget, type OpsConsoleData } from "./ops-console.js"

export type {
  IncidentPanelData,
  HistoryTimelineData,
  TaskDashboardData,
  InstanceDetailData,
  CockpitDashboardData,
  BpmnViewerData,
  JobPanelData,
  DeveloperWorkbenchData,
  OpsConsoleData,
}

export const camunda7Widgets: Record<string, ComponentType<{ data: unknown }>> = {
  "camunda7:incident-panel": IncidentPanelWidget as ComponentType<{ data: unknown }>,
  "camunda7:history-timeline": HistoryTimelineWidget as ComponentType<{ data: unknown }>,
  "camunda7:task-dashboard": TaskDashboardWidget as ComponentType<{ data: unknown }>,
  "camunda7:instance-detail": InstanceDetailWidget as ComponentType<{ data: unknown }>,
  "camunda7:cockpit-dashboard": CockpitDashboardWidget as ComponentType<{ data: unknown }>,
  "camunda7:bpmn-viewer": BpmnViewerWidget as ComponentType<{ data: unknown }>,
  "camunda7:job-panel": JobPanelWidget as ComponentType<{ data: unknown }>,
  "camunda7:developer-workbench": DeveloperWorkbenchWidget as ComponentType<{ data: unknown }>,
  "camunda7:ops-console": OpsConsoleWidget as ComponentType<{ data: unknown }>,
}
