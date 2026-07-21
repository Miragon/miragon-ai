import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import { camunda7Widgets } from "@miragon-ai/mcp-camunda7/widgets"
import { analyticsWidgets } from "@miragon-ai/mcp-analytics/widgets"
import { GenericDataTableWidget, GenericKpiGridWidget } from "@miragon-ai/widget-shell/widgets"

export const widgetRegistry: Record<string, WidgetComponent> = {
  ...camunda7Widgets,
  ...analyticsWidgets,
  // Generic shell widgets — the render-view/builder composition targets any
  // module can feed via props.dataKey (catalogue: @miragon-ai/widget-shell/server).
  "shell:kpi-grid": GenericKpiGridWidget,
  "shell:data-table": GenericDataTableWidget,
}
