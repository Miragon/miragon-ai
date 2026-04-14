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
  ],
}

export default definition
