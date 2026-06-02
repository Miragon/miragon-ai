import { z } from "zod"
import type { MCPServer } from "mcp-use/server"
import { buildComposedView, buildSingleWidgetView } from "@miragon-ai/widget-shell/server"
import { queries, type PrometheusClient } from "@miragon-ai/client-analytics"

const PERIOD = z.enum(["1d", "3d", "7d", "14d", "30d"])

export function registerWidgetTools(server: MCPServer, ch: PrometheusClient, resourceUri: string) {
  // --- Process Analytics Dashboard ---
  server.tool(
    {
      name: "analytics_show_dashboard",
      title: "Process Analytics Dashboard",
      description:
        "Show aggregated process metrics and KPIs from Prometheus with per-activity bottleneck breakdown.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      schema: z.object({
        processDefinitionKey: z.string().optional(),
        period: PERIOD.default("7d"),
        engineId: z.union([z.string(), z.array(z.string())]).optional(),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (args) => {
      const data = await queries.dashboardData(ch, {
        processDefinitionKey: args.processDefinitionKey,
        period: args.period,
        engineId: args.engineId,
      })
      return buildComposedView({
        app: "analytics",
        title: "Analytics Dashboard",
        layout: [
          { row: [{ widget: "analytics:execution-summary-kpi" }] },
          { row: [{ widget: "analytics:execution-performance-kpi" }] },
          { row: [{ widget: "analytics:process-definition-breakdown" }] },
          { row: [{ widget: "analytics:activity-bottleneck-table" }] },
        ],
        entries: [{ dataType: "analytics:dashboard", data }],
      })
    },
  )

  // --- Failure Dashboard ---
  server.tool(
    {
      name: "analytics_show_failure_dashboard",
      title: "Failure Analysis Dashboard",
      description:
        "Show current incident/failure state from Prometheus, grouped by incident type, activity, and process definition (point-in-time — what is failing right now).",
      annotations: { readOnlyHint: true, idempotentHint: true },
      schema: z.object({
        engineId: z.union([z.string(), z.array(z.string())]).optional(),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (args) => {
      const data = await queries.failureDashboardData(ch, {
        engineId: args.engineId,
      })
      return buildComposedView({
        app: "analytics",
        title: "Failure Dashboard",
        layout: [
          { row: [{ widget: "analytics:failure-summary-kpi" }] },
          { row: [{ widget: "analytics:error-patterns-table" }] },
          { row: [{ widget: "analytics:failure-rate-table" }] },
        ],
        entries: [{ dataType: "analytics:failureDashboard", data }],
      })
    },
  )

  // --- Cluster Compare (Pre/Post deployment diff) ---
  server.tool(
    {
      name: "analytics_show_cluster_compare",
      title: "Pre/Post Deployment Comparison",
      description:
        "Visualize before/after KPI deltas around a deployment timestamp. Results are flagged `suppressed` when either window has fewer than minBucketSize instances.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      schema: z.object({
        processDefinitionKey: z.string().optional(),
        elementId: z.string().optional(),
        deploymentTimestamp: z.string().min(1),
        windowBeforeDays: z.number().int().min(1).max(30).default(7),
        windowAfterDays: z.number().int().min(1).max(30).default(7),
        minBucketSize: z.number().int().min(1).default(10),
        engineId: z.union([z.string(), z.array(z.string())]).optional(),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (args) => {
      const data = await queries.clusterCompare(ch, args)
      return buildSingleWidgetView({
        widget: "analytics:cluster-compare",
        app: "analytics",
        dataType: "analytics:clusterCompare",
        data,
        title: "Cluster Compare",
      })
    },
  )

  // --- Version Compare (v1 vs v2 of one process) ---
  server.tool(
    {
      name: "analytics_show_version_compare",
      title: "Process Version Comparison",
      description:
        "Visualize KPI deltas between two deployed versions of the same processDefinitionKey within a shared time window. Results are flagged `suppressed` when either version has fewer than minBucketSize instances.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      schema: z.object({
        processDefinitionKey: z.string().min(1),
        versionA: z.number().int().min(1),
        versionB: z.number().int().min(1),
        windowDays: z.number().int().min(1).max(30).default(14),
        elementId: z.string().optional(),
        minBucketSize: z.number().int().min(1).default(10),
        engineId: z.union([z.string(), z.array(z.string())]).optional(),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (args) => {
      const data = await queries.versionCompare(ch, args)
      return buildSingleWidgetView({
        widget: "analytics:version-compare",
        app: "analytics",
        dataType: "analytics:versionCompare",
        data,
        title: "Version Compare",
      })
    },
  )
}
