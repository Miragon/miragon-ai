import { adaptDataWidget, type DescribeForModel } from "@miragon-ai/widget-shell/ui"
import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import type { HistoryTimelineData } from "../view-models.js"
import { ProcessListWidget } from "./process-list.js"
import { IncidentOverviewKpi } from "./incidents-dashboard/overview-kpi.js"
import { IncidentProcessList } from "./incidents-dashboard/process-list.js"
import { ProcessDetailHeader } from "./process-incidents/header.js"
import { ProcessIncidentKpi } from "./process-incidents/kpi.js"
import { ProcessIncidentFlow } from "./process-incidents/flow.js"
import { ActivityIncidentList } from "./process-incidents/list.js"
import { IncidentDetailWidget } from "./incident-detail.js"
import { HistoryTimelineWidget } from "./history-timeline.js"
import { InstanceDetailWidget } from "./instance-detail.js"
import { ClusterDetailWidget } from "./cluster-detail.js"
import { EngineHealthVerdict } from "./engine-health.js"
import { ProcessHealthKpi } from "./cockpit-dashboard/health-kpi.js"
import { ProcessDefinitionsTable } from "./cockpit-dashboard/definitions-table.js"
import { ProcessDetailWidget } from "./process-detail.js"
import { BpmnViewerHeader } from "./bpmn-viewer/header.js"
import { BpmnViewerLegend } from "./bpmn-viewer/legend.js"
import { BpmnFlowViewer } from "./bpmn-viewer/flow.js"
import { BpmnViewerWidget } from "./bpmn-viewer/widget.js"
import { JobPanelWidget } from "./job-panel.js"
import { ProcessInstancesWidget } from "./process-instances/list.js"

/**
 * Model context for the history timeline, attached via the adapter — this
 * widget never self-fetches (data always arrives through the step result), so
 * the central `describeForModel` lever covers every render path. Widgets that
 * self-fetch in the cockpit (incident-detail, job-panel, instance-detail,
 * process-instances) render their own `<ModelContext>` in-component instead.
 */
const describeHistoryTimeline: DescribeForModel<HistoryTimelineData> = (data) => {
  const pi = data.processInstance
  const head = pi
    ? `Viewing the activity history timeline of process instance ${pi.id} ` +
      `(${pi.processDefinitionName ?? pi.processDefinitionKey}, state ${pi.state})`
    : `Viewing an activity history timeline`
  const span = pi ? ` from ${pi.startTime} to ${pi.endTime ?? "now (still running)"}` : ""
  return (
    `${head} on engine ${data.engineId ?? "default"}: ${data.totalActivities} ` +
    `activities${span}. Full per-activity timing via ` +
    `camunda7_query_historic_activity_instances; compare against the definition ` +
    `baseline with analytics_element_bottleneck.`
  )
}

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
  "camunda7:history-timeline": adaptDataWidget(
    HistoryTimelineWidget,
    "camunda7:historyTimeline",
    describeHistoryTimeline,
  ),
  "camunda7:instance-detail": adaptDataWidget(InstanceDetailWidget, "camunda7:processInstance"),
  "camunda7:engine-health": adaptDataWidget(EngineHealthVerdict, "camunda7:engineHealth"),
  "camunda7:cluster-detail": adaptDataWidget(ClusterDetailWidget, "camunda7:clusterDetail"),
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
}
