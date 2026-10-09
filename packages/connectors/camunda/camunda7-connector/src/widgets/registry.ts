import { adaptDataWidget } from "@miragon-ai/widget-shell/ui"
import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import { ProcessListWidget } from "./process-list.js"
import { IncidentOverviewKpi } from "./incidents-dashboard/overview-kpi.js"
import { IncidentProcessList } from "./incidents-dashboard/process-list.js"
import { ProcessDetailHeader } from "./process-incidents/header.js"
import { ProcessDefinitionKpi } from "./process-incidents/kpi.js"
import { ProcessDefinitionFlow } from "./process-incidents/flow.js"
import { ActivityIncidentList } from "./process-incidents/list.js"
import { IncidentDetailWidget } from "./incident-detail.js"
import { HistoryTimelineWidget } from "./history-timeline.js"
import { InstanceDetailWidget } from "./instance-detail.js"
import { ClusterDetailWidget } from "./cluster-detail.js"
import { EngineHealthVerdict } from "./engine-health.js"
import { ProcessHealthKpi } from "./cockpit-dashboard/health-kpi.js"
import { ProcessDefinitionsTable } from "./cockpit-dashboard/definitions-table.js"
import { BpmnViewerHeader } from "./bpmn-viewer/header.js"
import { BpmnViewerLegend } from "./bpmn-viewer/legend.js"
import { BpmnFlowViewer } from "./bpmn-viewer/flow.js"
import { BpmnViewerWidget } from "./bpmn-viewer/widget.js"
import { JobPanelWidget } from "./job-panel.js"
import { ProcessInstancesWidget } from "./process-instances/list.js"
import { UserProfileWidget } from "./user-profile.js"

/**
 * The leaf widget registry — every CIB Seven widget EXCEPT the consolidated
 * `camunda7:cockpit-app`. The cockpit app renders these generically through the
 * toolkit `WidgetRenderer`, so it imports this base map. Keeping the cockpit-app
 * registration out of here breaks the import cycle (cockpit-app → registry →
 * cockpit-app); `widgets/index.ts` re-exports this and adds the cockpit-app entry
 * for the host bundle.
 */
export const camunda7BaseWidgets: Record<string, WidgetComponent> = {
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
  "camunda7:process-definition-kpi": adaptDataWidget(
    ProcessDefinitionKpi,
    "camunda7:processIncidents",
  ),
  "camunda7:process-definition-flow": adaptDataWidget(
    ProcessDefinitionFlow,
    "camunda7:processIncidents",
  ),
  "camunda7:activity-incident-list": adaptDataWidget(
    ActivityIncidentList,
    "camunda7:processIncidents",
  ),
  "camunda7:incident-detail": adaptDataWidget(IncidentDetailWidget, "camunda7:incidentDetail"),
  // Renders its model context in-component: the tools it names follow the
  // deployment's live surface, which only a mounted widget can query.
  "camunda7:history-timeline": adaptDataWidget(HistoryTimelineWidget, "camunda7:historyTimeline"),
  "camunda7:instance-detail": adaptDataWidget(InstanceDetailWidget, "camunda7:processInstance"),
  "camunda7:engine-health": adaptDataWidget(EngineHealthVerdict, "camunda7:engineHealth"),
  "camunda7:cluster-detail": adaptDataWidget(ClusterDetailWidget, "camunda7:clusterDetail"),
  "camunda7:process-health-kpi": adaptDataWidget(ProcessHealthKpi, "camunda7:cockpitDashboard"),
  "camunda7:process-definitions-table": adaptDataWidget(
    ProcessDefinitionsTable,
    "camunda7:cockpitDashboard",
  ),
  "camunda7:bpmn-viewer": adaptDataWidget(BpmnViewerWidget, "camunda7:bpmnViewer"),
  "camunda7:bpmn-viewer-header": adaptDataWidget(BpmnViewerHeader, "camunda7:bpmnViewer"),
  "camunda7:bpmn-viewer-legend": adaptDataWidget(BpmnViewerLegend, "camunda7:bpmnViewer"),
  "camunda7:bpmn-flow-viewer": adaptDataWidget(BpmnFlowViewer, "camunda7:bpmnViewer"),
  "camunda7:job-panel": adaptDataWidget(JobPanelWidget, "camunda7:jobPanel"),
  "camunda7:process-instances": adaptDataWidget(
    ProcessInstancesWidget,
    "camunda7:processInstances",
  ),
  // Self-fetching: loads camunda7_user_profile_data for the signed-in caller (no
  // pipeline step), eager-rendered by camunda7_show_user_profile.
  "camunda7:user-profile": adaptDataWidget(UserProfileWidget, "camunda7:userProfile"),
}
