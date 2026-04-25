import { adaptDataWidget } from "@miragon-ai/widget-shell/ui"
import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
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

export const camunda7Widgets: Record<string, WidgetComponent> = {
  "camunda7:process-list": adaptDataWidget(ProcessListWidget, "camunda7:processDefinitionList"),
  "camunda7:incident-panel": adaptDataWidget(IncidentPanelWidget, "camunda7:incidentPanel"),
  "camunda7:history-timeline": adaptDataWidget(HistoryTimelineWidget, "camunda7:historyTimeline"),
  "camunda7:task-dashboard": adaptDataWidget(TaskDashboardWidget, "camunda7:taskList"),
  "camunda7:instance-detail": adaptDataWidget(InstanceDetailWidget, "camunda7:processInstance"),
  "camunda7:cockpit-dashboard": adaptDataWidget(
    CockpitDashboardWidget,
    "camunda7:cockpitDashboard",
  ),
  "camunda7:bpmn-viewer": adaptDataWidget(BpmnViewerWidget, "camunda7:bpmnViewer"),
  "camunda7:deployment-browser": adaptDataWidget(
    DeploymentBrowserWidget,
    "camunda7:deploymentBrowser",
  ),
  "camunda7:job-panel": adaptDataWidget(JobPanelWidget, "camunda7:jobPanel"),
}
