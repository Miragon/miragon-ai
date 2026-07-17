import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import { camunda7Widgets } from "@miragon-ai/mcp-cibseven/widgets"
import { analyticsWidgets } from "@miragon-ai/mcp-analytics/widgets"
import { GenericDataTableWidget, GenericKpiGridWidget } from "@miragon-ai/widget-shell/widgets"

export const widgetRegistry: Record<string, WidgetComponent> = {
  ...camunda7Widgets,
  ...analyticsWidgets,
  // Generic shell widgets — the render-view targets any module/upstream can
  // feed via props.dataKey (catalogued in ../shell-widgets.ts).
  "shell:kpi-grid": GenericKpiGridWidget,
  "shell:data-table": GenericDataTableWidget,
}
