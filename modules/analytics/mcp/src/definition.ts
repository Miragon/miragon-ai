import type { AppDefinition } from "@miragon/mcp-toolkit-core"
import { loadDashboardStep } from "./steps/index.js"

export const definition: AppDefinition = {
  name: "analytics",
  steps: [loadDashboardStep],
  widgets: [
    {
      id: "analytics:dashboard",
      requires: ["analytics:dashboardData"],
      size: "full",
    },
    {
      id: "analytics:failure-dashboard",
      requires: [],
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
