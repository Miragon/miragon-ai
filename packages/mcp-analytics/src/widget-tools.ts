import { z } from "zod"
import type { MCPServer } from "mcp-use/server"
import { buildComposedView, buildSingleWidgetView } from "@miragon-ai/widget-shell/server"
import { queries, type PrometheusClient } from "@miragon-ai/client-analytics"
import type { Client as Camunda7Client } from "@miragon-ai/client-cibseven"
import { getProcessDefinitionBpmn20XmlByKey } from "@miragon-ai/client-cibseven/generated/sdk.gen"

const PERIOD = z.enum(["1d", "3d", "7d", "14d", "30d"])

export interface AnalyticsWidgetToolsOptions {
  /** Used by the BPMN heatmap to fetch the diagram XML. Absent → non-diagram fallback. */
  camunda7Client?: Camunda7Client
}

export function registerWidgetTools(
  server: MCPServer,
  ch: PrometheusClient,
  resourceUri: string,
  options: AnalyticsWidgetToolsOptions = {},
) {
  const camunda7Client = options.camunda7Client
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

  // --- Engine Compare (engine A vs engine B across the fleet) ---
  server.tool(
    {
      name: "analytics_show_engine_compare",
      title: "Engine Comparison",
      description:
        "Visualize KPI deltas between two CIB Seven engines (e.g. prod-a vs prod-b) over a shared time window. Optionally scope to one processDefinitionKey. Results are flagged `suppressed` when either engine has fewer than minBucketSize instances.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      schema: z.object({
        engineA: z.string().min(1),
        engineB: z.string().min(1),
        windowDays: z.number().int().min(1).max(30).default(14),
        processDefinitionKey: z.string().optional(),
        elementId: z.string().optional(),
        minBucketSize: z.number().int().min(1).default(10),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (args) => {
      const data = await queries.engineCompare(ch, args)
      return buildSingleWidgetView({
        widget: "analytics:engine-compare",
        app: "analytics",
        dataType: "analytics:engineCompare",
        data,
        title: "Engine Compare",
      })
    },
  )

  // --- BPMN Heatmap (per-element frequency + duration on the diagram) ---
  server.tool(
    {
      name: "analytics_show_bpmn_heatmap",
      title: "BPMN Heatmap",
      description:
        "Render a process definition's BPMN diagram with a per-element heat overlay from metrics, with a Frequency↔Duration toggle (traversal count vs average duration per element). Node-level only — sequence-flow/edge heat is not available from metrics — and rendered on the latest deployed version's diagram (activity metrics carry no version label). Needs the camunda7 client to fetch the BPMN XML; otherwise the widget shows a fallback.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      schema: z.object({
        processDefinitionKey: z.string().min(1),
        period: PERIOD.default("7d"),
        engineId: z.union([z.string(), z.array(z.string())]).optional(),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (args) => {
      const heat = await queries.elementHeat(ch, args)
      let bpmnXml: string | null = null
      if (camunda7Client) {
        const xmlResp = (await getProcessDefinitionBpmn20XmlByKey({
          client: camunda7Client,
          path: { key: args.processDefinitionKey },
        }).catch(() => null)) as { bpmn20Xml?: string } | null
        bpmnXml = xmlResp?.bpmn20Xml ?? null
      }
      return buildSingleWidgetView({
        widget: "analytics:bpmn-heatmap",
        app: "analytics",
        dataType: "analytics:bpmnHeatmap",
        data: {
          processDefinitionKey: args.processDefinitionKey,
          period: args.period,
          bpmnXml,
          frequency: heat.frequency,
          durationSec: heat.durationSec,
        },
        title: "BPMN Heatmap",
      })
    },
  )

  server.tool(
    {
      name: "analytics_bpmn_heatmap_data",
      title: "BPMN heatmap data (internal)",
      description:
        "Internal JSON feed (no UI) for the BPMN heatmap — per-element execution frequency + average duration over a window, plus the latest BPMN XML. Lets another widget (e.g. the CIB Seven cockpit) render the heatmap inline. Prefer analytics_show_bpmn_heatmap for a standalone view.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      schema: z.object({
        processDefinitionKey: z.string().min(1),
        period: PERIOD.default("7d"),
        engineId: z.union([z.string(), z.array(z.string())]).optional(),
      }),
    },
    async (args) => {
      const heat = await queries.elementHeat(ch, args)
      let bpmnXml: string | null = null
      if (camunda7Client) {
        const xmlResp = (await getProcessDefinitionBpmn20XmlByKey({
          client: camunda7Client,
          path: { key: args.processDefinitionKey },
        }).catch(() => null)) as { bpmn20Xml?: string } | null
        bpmnXml = xmlResp?.bpmn20Xml ?? null
      }
      const data = {
        processDefinitionKey: args.processDefinitionKey,
        period: args.period,
        bpmnXml,
        frequency: heat.frequency,
        durationSec: heat.durationSec,
      }
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data }
    },
  )
}
