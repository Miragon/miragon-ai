import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import { camunda7Widgets } from "@miragon-ai/camunda7-connector/widgets"
import { analyticsWidgets } from "@miragon-ai/analytics-connector/widgets"
import { GenericDataTableWidget, GenericKpiGridWidget } from "@miragon-ai/widget-shell/widgets"

export const widgetRegistry = {
  ...camunda7Widgets,
  ...analyticsWidgets,
  // Generic shell widgets — the render-view/builder composition targets any
  // module can feed via props.dataKey (catalogue: @miragon-ai/widget-shell/server).
  "shell:kpi-grid": GenericKpiGridWidget,
  "shell:data-table": GenericDataTableWidget,
} satisfies Record<string, WidgetComponent>
