import type { ComponentType } from "react"
import { AnalyticsDashboardWidget, type AnalyticsDashboardData } from "./analytics-dashboard.js"

export type { AnalyticsDashboardData }

export const analyticsWidgets: Record<string, ComponentType<{ data: unknown }>> = {
  "analytics:dashboard": AnalyticsDashboardWidget as ComponentType<{ data: unknown }>,
}
