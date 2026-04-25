import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import { camunda7Widgets } from "@miragon-ai/mcp-cibseven/widgets"
import { analyticsWidgets } from "@miragon-ai/mcp-analytics/widgets"

export const widgetRegistry: Record<string, WidgetComponent> = {
  ...camunda7Widgets,
  ...analyticsWidgets,
}
