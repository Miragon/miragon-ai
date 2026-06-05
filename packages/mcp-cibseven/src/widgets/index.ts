import { adaptDataWidget } from "@miragon-ai/widget-shell/ui"
import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import { ProcessListWidget, type ProcessListData } from "./process-list.js"
import type { IncidentsDashboardData } from "@miragon-ai/client-cibseven"
import { IncidentOverviewKpi } from "./incidents-dashboard/overview-kpi.js"
import { IncidentProcessList } from "./incidents-dashboard/process-list.js"
import type { ProcessIncidentsData } from "@miragon-ai/client-cibseven"
import { ProcessDetailHeader } from "./process-incidents/header.js"
import { ProcessIncidentKpi } from "./process-incidents/kpi.js"
import { ProcessIncidentFlow } from "./process-incidents/flow.js"
import { ActivityIncidentList } from "./process-incidents/list.js"
import { IncidentDetailWidget, type IncidentDetailData } from "./incident-detail.js"
import { HistoryTimelineWidget, type HistoryTimelineData } from "./history-timeline.js"
import { InstanceDetailWidget, type InstanceDetailData } from "./instance-detail.js"
import type { CockpitDashboardData } from "@miragon-ai/client-cibseven"
import { ProcessHealthKpi } from "./cockpit-dashboard/health-kpi.js"
import { ProcessDefinitionsTable } from "./cockpit-dashboard/definitions-table.js"
import { ProcessDetailWidget, type ProcessDetailData } from "./process-detail.js"
import type { BpmnViewerData } from "@miragon-ai/client-cibseven"
import { BpmnViewerHeader } from "./bpmn-viewer/header.js"
import { BpmnViewerLegend } from "./bpmn-viewer/legend.js"
import { BpmnFlowViewer } from "./bpmn-viewer/flow.js"
import { BpmnViewerWidget } from "./bpmn-viewer/widget.js"
import { JobPanelWidget, type JobPanelData } from "./job-panel.js"
import { ProcessInstancesWidget, type ProcessInstancesData } from "./process-instances/list.js"
import { CockpitApp } from "./cockpit-app/app.js"

export type {
  ProcessListData,
  IncidentsDashboardData,
  ProcessIncidentsData,
  IncidentDetailData,
  HistoryTimelineData,
  InstanceDetailData,
  CockpitDashboardData,
  ProcessDetailData,
  BpmnViewerData,
  JobPanelData,
  ProcessInstancesData,
}

export const camunda7Widgets: Record<string, WidgetComponent> = {
  "camunda7:process-list": adaptDataWidget(ProcessListWidget, "camunda7:processDefinitionList"),
  "camunda7:incident-overview-kpi": adaptDataWidget(
    IncidentOverviewKpi,
    "camunda7:incidentsDashboard",
  ),
  "camunda7:incident-process-list": adaptDataWidget(
    IncidentProcessList,
    "camunda7:incidentsDashboard",
  ),
  "camunda7:process-detail-header": adaptDataWidget(
    ProcessDetailHeader,
    "camunda7:processIncidents",
  ),
  "camunda7:process-incident-kpi": adaptDataWidget(ProcessIncidentKpi, "camunda7:processIncidents"),
  "camunda7:process-incident-flow": adaptDataWidget(
    ProcessIncidentFlow,
    "camunda7:processIncidents",
  ),
  "camunda7:activity-incident-list": adaptDataWidget(
    ActivityIncidentList,
    "camunda7:processIncidents",
  ),
  "camunda7:incident-detail": adaptDataWidget(IncidentDetailWidget, "camunda7:incidentDetail"),
  "camunda7:history-timeline": adaptDataWidget(HistoryTimelineWidget, "camunda7:historyTimeline"),
  "camunda7:instance-detail": adaptDataWidget(InstanceDetailWidget, "camunda7:processInstance"),
  "camunda7:process-health-kpi": adaptDataWidget(ProcessHealthKpi, "camunda7:cockpitDashboard"),
  "camunda7:process-definitions-table": adaptDataWidget(
    ProcessDefinitionsTable,
    "camunda7:cockpitDashboard",
  ),
  "camunda7:process-detail": adaptDataWidget(ProcessDetailWidget, "camunda7:processDetail"),
  "camunda7:bpmn-viewer": adaptDataWidget(BpmnViewerWidget, "camunda7:bpmnViewer"),
  "camunda7:bpmn-viewer-header": adaptDataWidget(BpmnViewerHeader, "camunda7:bpmnViewer"),
  "camunda7:bpmn-viewer-legend": adaptDataWidget(BpmnViewerLegend, "camunda7:bpmnViewer"),
  "camunda7:bpmn-flow-viewer": adaptDataWidget(BpmnFlowViewer, "camunda7:bpmnViewer"),
  "camunda7:job-panel": adaptDataWidget(JobPanelWidget, "camunda7:jobPanel"),
  "camunda7:process-instances": adaptDataWidget(
    ProcessInstancesWidget,
    "camunda7:processInstances",
  ),
  "camunda7:cockpit-app": adaptDataWidget(CockpitApp, "camunda7:cockpitApp"),
}
