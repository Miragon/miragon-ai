import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import { camunda7Widgets } from "@miragon-ai/camunda7-connector/widgets"
import { analyticsWidgets } from "@miragon-ai/analytics-connector/widgets"
import { shellWidgets } from "@miragon-ai/widget-shell/widgets"

export const widgetRegistry = {
  ...camunda7Widgets,
  ...analyticsWidgets,
  // The shell's widgets (catalogue: @miragon-ai/widget-shell/server): the
  // generic composition targets any module feeds via props.dataKey, and the
  // settings page with its language section.
  ...shellWidgets,
} satisfies Record<string, WidgetComponent>
