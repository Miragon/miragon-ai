import { z } from "zod"
import type { AppDefinition } from "@miragon/mcp-toolkit-core"
import { loadDashboardStep, loadFailureDashboardStep } from "./steps/index.js"

const dashboardPropsSchema = z.toJSONSchema(
  z.object({
    processDefinitionKey: z
      .string()
      .optional()
      .describe(
        "Scope the dashboard to a single process definition (e.g. 'miraveloLeasing'). When omitted, all processes are aggregated.",
      ),
    period: z
      .enum(["1d", "7d", "30d", "90d"])
      .optional()
      .describe("Time window for the self-fetch when no upstream pipeline step populates data."),
  }),
)

const pathFrequencyPropsSchema = z.toJSONSchema(
  z.object({
    processDefinitionKey: z
      .string()
      .optional()
      .describe(
        "Process definition key to analyze. Without it the widget renders a placeholder asking the user to configure it.",
      ),
    period: z.enum(["1d", "7d", "30d", "90d"]).optional().describe("Time window (default `7d`)."),
    minBucketSize: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Suppress paths seen fewer than this many times (default `10`)."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max number of paths to return (default `20`)."),
  }),
)

export const definition: AppDefinition = {
  name: "analytics",
  steps: [loadDashboardStep, loadFailureDashboardStep],
  widgets: [
    {
      id: "analytics:dashboard",
      requires: [],
      size: "full",
      propsSchema: dashboardPropsSchema,
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
      propsSchema: pathFrequencyPropsSchema,
    },
    {
      id: "analytics:cluster-compare",
      requires: [],
      size: "full",
    },
  ],
}

export default definition
