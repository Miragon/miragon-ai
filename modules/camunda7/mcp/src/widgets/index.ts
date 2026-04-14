import type { ComponentType } from "react"
import { ProcessListWidget, type ProcessListData } from "./process-list.js"
import { IncidentPanelWidget, type IncidentPanelData } from "./incident-panel.js"
import { HistoryTimelineWidget, type HistoryTimelineData } from "./history-timeline.js"
import { TaskDashboardWidget, type TaskDashboardData } from "./task-dashboard.js"
import { InstanceDetailWidget, type InstanceDetailData } from "./instance-detail.js"

export type { ProcessListData, IncidentPanelData, HistoryTimelineData, TaskDashboardData, InstanceDetailData }

export const camunda7Widgets: Record<string, ComponentType<{ data: unknown }>> = {
  "camunda7:process-list": ProcessListWidget as ComponentType<{ data: unknown }>,
  "camunda7:incident-panel": IncidentPanelWidget as ComponentType<{ data: unknown }>,
  "camunda7:history-timeline": HistoryTimelineWidget as ComponentType<{ data: unknown }>,
  "camunda7:task-dashboard": TaskDashboardWidget as ComponentType<{ data: unknown }>,
  "camunda7:instance-detail": InstanceDetailWidget as ComponentType<{ data: unknown }>,
}
