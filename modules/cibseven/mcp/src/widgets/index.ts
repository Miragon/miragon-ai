import type { ComponentType } from "react"
import { ProcessListWidget, type ProcessListData } from "./process-list.js"
import { IncidentPanelWidget, type IncidentPanelData } from "./incident-panel.js"
import { HistoryTimelineWidget, type HistoryTimelineData } from "./history-timeline.js"
import { TaskDashboardWidget, type TaskDashboardData } from "./task-dashboard.js"
import { InstanceDetailWidget, type InstanceDetailData } from "./instance-detail.js"
import { CockpitDashboardWidget, type CockpitDashboardData } from "./cockpit-dashboard.js"
import { BpmnViewerWidget, type BpmnViewerData } from "./bpmn-viewer.js"
import { DeploymentBrowserWidget, type DeploymentBrowserData } from "./deployment-browser.js"
import { JobPanelWidget, type JobPanelData } from "./job-panel.js"

export type {
  ProcessListData,
  IncidentPanelData,
  HistoryTimelineData,
  TaskDashboardData,
  InstanceDetailData,
  CockpitDashboardData,
  BpmnViewerData,
  DeploymentBrowserData,
  JobPanelData,
}

export const camunda7Widgets: Record<string, ComponentType<{ data: unknown }>> = {
  "camunda7:process-list": ProcessListWidget as ComponentType<{ data: unknown }>,
  "camunda7:incident-panel": IncidentPanelWidget as ComponentType<{ data: unknown }>,
  "camunda7:history-timeline": HistoryTimelineWidget as ComponentType<{ data: unknown }>,
  "camunda7:task-dashboard": TaskDashboardWidget as ComponentType<{ data: unknown }>,
  "camunda7:instance-detail": InstanceDetailWidget as ComponentType<{ data: unknown }>,
  "camunda7:cockpit-dashboard": CockpitDashboardWidget as ComponentType<{ data: unknown }>,
  "camunda7:bpmn-viewer": BpmnViewerWidget as ComponentType<{ data: unknown }>,
  "camunda7:deployment-browser": DeploymentBrowserWidget as ComponentType<{ data: unknown }>,
  "camunda7:job-panel": JobPanelWidget as ComponentType<{ data: unknown }>,
}
