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

const failureDashboardPropsSchema = z.toJSONSchema(
  z.object({
    period: z
      .enum(["1d", "7d", "30d", "90d"])
      .optional()
      .describe("Time window for the self-fetch when no upstream pipeline step populates data."),
  }),
)

export const definition: AppDefinition = {
  name: "analytics",
  steps: [loadDashboardStep, loadFailureDashboardStep],
  widgets: [
    {
      id: "analytics:execution-summary-kpi",
      description:
        "Top-line execution KPIs (total / completed / running / failed / incidents) over the selected period.",
      requires: [],
      consumes: ["analytics:dashboard"],
      size: "full",
      propsSchema: dashboardPropsSchema,
    },
    {
      id: "analytics:execution-performance-kpi",
      description:
        "Duration KPIs for completed instances (avg, median, p95) over the selected period.",
      requires: [],
      consumes: ["analytics:dashboard"],
      size: "full",
      propsSchema: dashboardPropsSchema,
    },
    {
      id: "analytics:process-definition-breakdown",
      description:
        "Per-process-definition breakdown of instance counts, failure counts, and average duration.",
      requires: [],
      consumes: ["analytics:dashboard"],
      size: "full",
      propsSchema: dashboardPropsSchema,
    },
    {
      id: "analytics:activity-bottleneck-table",
      description:
        "Top activities by total time spent — surfaces bottlenecks across the process landscape.",
      requires: [],
      consumes: ["analytics:dashboard"],
      size: "full",
      propsSchema: dashboardPropsSchema,
    },
    {
      id: "analytics:period-selector",
      description:
        "Interactive period chooser (1d / 7d / 30d / 90d) for the failure dashboard. Re-issues `analytics_show_failure_dashboard` on selection.",
      requires: [],
      consumes: ["analytics:failureDashboard"],
      size: "full",
    },
    {
      id: "analytics:failure-summary-kpi",
      description:
        "Failure summary KPIs (total incidents, unique error patterns, most affected process).",
      requires: [],
      consumes: ["analytics:failureDashboard"],
      size: "full",
      propsSchema: failureDashboardPropsSchema,
    },
    {
      id: "analytics:error-patterns-table",
      description:
        "Top incident patterns grouped by incident type + activity + process, with counts.",
      requires: [],
      consumes: ["analytics:failureDashboard"],
      size: "full",
      propsSchema: failureDashboardPropsSchema,
    },
    {
      id: "analytics:failure-rate-table",
      description: "Per-process-definition failure rates (failed / total, incident count, %).",
      requires: [],
      consumes: ["analytics:failureDashboard"],
      size: "full",
      propsSchema: failureDashboardPropsSchema,
    },
    {
      id: "analytics:cluster-compare",
      description:
        "Side-by-side before/after comparison of instance KPIs around a deployment timestamp.",
      requires: [],
      consumes: ["analytics:clusterCompare"],
      size: "full",
    },
    {
      id: "analytics:version-compare",
      description:
        "Side-by-side per-version comparison of KPIs (failure/incident rate, duration) across two process versions.",
      requires: [],
      consumes: ["analytics:versionCompare"],
      size: "full",
    },
  ],
}

export default definition
