import type { AppDefinition } from "@miragon/mcp-toolkit-core"
import { loadDashboardStep, loadFailureDashboardStep } from "./steps/index.js"

export const definition: AppDefinition = {
  name: "analytics",
  steps: [loadDashboardStep, loadFailureDashboardStep],
  widgets: [
    {
      id: "analytics:dashboard",
      requires: ["analytics:dashboardData"],
      size: "full",
    },
    {
      id: "analytics:failure-dashboard",
      requires: ["analytics:failureDashboardData"],
      size: "full",
    },
    {
      id: "analytics:variable-search",
      requires: [],
      size: "full",
    },
    {
      id: "analytics:execution-trace",
      requires: [],
      size: "full",
    },
    {
      id: "analytics:path-frequency",
      requires: [],
      size: "full",
    },
    {
      id: "analytics:cluster-compare",
      requires: [],
      size: "full",
    },
  ],
}

export default definition
