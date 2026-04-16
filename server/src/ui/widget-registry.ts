import type { ComponentType } from "react"
import { camunda7Widgets } from "@miragon-ai/mcp-camunda7/widgets"
import { analyticsWidgets } from "@miragon-ai/mcp-analytics/widgets"

type WidgetComponent = ComponentType<{ data: unknown }>

export const widgetRegistry: Record<string, WidgetComponent> = {
  ...camunda7Widgets,
  ...analyticsWidgets,
}

export function getWidgetComponent(widgetId: string): WidgetComponent | null {
  return widgetRegistry[widgetId] ?? null
}
