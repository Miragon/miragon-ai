import { adaptDataWidget } from "@miragon-ai/widget-shell/ui"
import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import type {
  IncidentsDashboardData,
  ProcessIncidentsData,
  CockpitDashboardData,
  BpmnViewerData,
} from "../view-models.js"
import type { ProcessListData } from "./process-list.js"
import type { IncidentDetailData } from "./incident-detail.js"
import type { HistoryTimelineData } from "./history-timeline.js"
import type { InstanceDetailData } from "./instance-detail.js"
import type { JobPanelData } from "./job-panel.js"
import type { ProcessInstancesData } from "./process-instances/list.js"
import { camunda7BaseWidgets } from "./registry.js"
import { CockpitApp } from "./cockpit-app/app.js"

export { Camunda7StandaloneShell } from "./standalone-shell.js"

/**
 * The cockpit's view→layout catalogue. Exported so a composition root can
 * ASSERT over the composition — notably that every module it composes actually
 * contributes its `<module>:settings` section to the settings page (see the
 * app's `widget-registry.test.ts`). Those assertions go through the RUNTIME
 * call path, `cockpitViews.settings(params, { widgetIds })`, so the router
 * wiring is covered too; `settingsLayout` itself stays package-internal (its
 * own unit tests import it directly) and off the published surface.
 */
export { cockpitViews, filterLayoutToWidgets } from "./cockpit-app/views.js"

export type {
  ProcessListData,
  IncidentsDashboardData,
  ProcessIncidentsData,
  IncidentDetailData,
  HistoryTimelineData,
  InstanceDetailData,
  CockpitDashboardData,
  BpmnViewerData,
  JobPanelData,
  ProcessInstancesData,
}

/**
 * Full widget registry handed to the host bundle: the leaf widgets
 * ({@link camunda7BaseWidgets}) plus the consolidated cockpit app. The cockpit
 * app itself renders the leaf widgets through the toolkit renderer using the base
 * map, so it is added here (and only here) to avoid an import cycle.
 */
export const camunda7Widgets: Record<string, WidgetComponent> = {
  ...camunda7BaseWidgets,
  "camunda7:cockpit-app": adaptDataWidget(CockpitApp, "camunda7:cockpitApp"),
}
