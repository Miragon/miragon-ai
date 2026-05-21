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

const executionTracePropsSchema = z.toJSONSchema(
  z.object({
    processInstanceId: z
      .string()
      .optional()
      .describe(
        "Pre-fills the trace input and auto-runs the trace on mount. Lets a layout cell pin the widget to a specific instance.",
      ),
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
        "Top error patterns grouped by message + activity + process, with sample instance ids and first/last occurrence.",
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
      id: "analytics:variable-search",
      description:
        "Interactive search over historic process variables (input form + result table). Uses its own self-fetch via `analytics_search_by_variable`.",
      requires: [],
      consumes: ["analytics:variableSearch"],
      size: "full",
    },
    {
      id: "analytics:execution-trace",
      description:
        "Per-instance execution trace (activity history + variable changes + OTel spans). Takes a process instance id either via cell props or interactively.",
      requires: [],
      consumes: ["analytics:executionTrace"],
      size: "full",
      propsSchema: executionTracePropsSchema,
    },
    {
      id: "analytics:path-frequency",
      description:
        "Sankey-style flow heatmap of the most frequent execution paths through the BPMN. Self-fetches when given a `processDefinitionKey` cell prop.",
      requires: [],
      consumes: ["analytics:pathFrequency"],
      size: "full",
      propsSchema: pathFrequencyPropsSchema,
    },
    {
      id: "analytics:cluster-compare",
      description:
        "Side-by-side comparison of two instance clusters by performance, failure rate, and structural differences. Cluster definitions come from the parent step.",
      requires: [],
      consumes: ["analytics:clusterCompare"],
      size: "full",
    },
    {
      id: "analytics:version-compare",
      description:
        "Side-by-side per-version comparison of an analytics metric (e.g. failure rate, duration) across two process versions.",
      requires: [],
      consumes: ["analytics:versionCompare"],
      size: "full",
    },
  ],
}

export default definition
