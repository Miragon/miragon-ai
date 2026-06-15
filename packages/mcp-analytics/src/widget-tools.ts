import { z } from "zod"
import type { MCPServer } from "mcp-use/server"
import { APP_ONLY_META, uiMeta as buildUiMeta } from "@miragon/mcp-toolkit-core"
import {
  buildComposedView,
  buildSingleWidgetView,
  withToolErrors,
} from "@miragon-ai/widget-shell/server"
import { queries, schemas, type PrometheusClient } from "@miragon-ai/client-analytics"
import type { Client as Camunda7Client } from "@miragon-ai/client-cibseven"
import { getProcessDefinitionBpmn20XmlByKey } from "@miragon-ai/client-cibseven/sdk"

export interface AnalyticsWidgetToolsOptions {
  /** Used by the BPMN heatmap to fetch the diagram XML. Absent → non-diagram fallback. */
  camunda7Client?: Camunda7Client
}

/**
 * Heatmap inputs shared by `analytics_show_bpmn_heatmap` and its
 * `analytics_bpmn_heatmap_data` feed, composed from the exported client
 * schemas so the describe() texts stay in one place.
 */
const heatmapInputShape = {
  processDefinitionKey: schemas.elementBottleneckInput.shape.processDefinitionKey,
  period: schemas.elementBottleneckInput.shape.period,
  ...schemas.engineFilterShape,
}

/** Formats a nullable comparison delta ("+12.5%", "-3pp", "n/a") for summaries. */
function fmtDelta(value: number | null, unit: string): string {
  if (value == null) return "n/a"
  return `${value > 0 ? "+" : ""}${value}${unit}`
}

/** Shared delta shape of the three compare queries, for one-line summaries. */
function compareDeltaSummary(delta: {
  failure_rate_delta_pp: number | null
  avg_duration_delta_pct: number | null
  p95_duration_delta_pct: number | null
}): string {
  return (
    `failure rate ${fmtDelta(delta.failure_rate_delta_pp, "pp")}, ` +
    `avg duration ${fmtDelta(delta.avg_duration_delta_pct, "%")}, ` +
    `p95 ${fmtDelta(delta.p95_duration_delta_pct, "%")}`
  )
}

const suppressedNote = (suppressed: boolean) =>
  suppressed ? " — flagged suppressed (sample below minBucketSize)" : ""

export function registerWidgetTools(
  server: MCPServer,
  ch: PrometheusClient,
  resourceUri: string,
  options: AnalyticsWidgetToolsOptions = {},
) {
  const camunda7Client = options.camunda7Client
  const uiMeta = buildUiMeta({ resourceUri })

  /**
   * Fetches the latest deployed version's BPMN XML for the heatmap overlay.
   * Returns `null` without a camunda7 client or on any fetch error — the
   * widget renders its non-diagram fallback in that case.
   */
  async function fetchBpmnXml(processDefinitionKey: string): Promise<string | null> {
    if (!camunda7Client) return null
    const xmlResp = (await getProcessDefinitionBpmn20XmlByKey({
      client: camunda7Client,
      path: { key: processDefinitionKey },
    }).catch(() => null)) as { bpmn20Xml?: string } | null
    return xmlResp?.bpmn20Xml ?? null
  }

  // --- Process Analytics Dashboard ---
  server.tool(
    {
      name: "analytics_show_dashboard",
      title: "Process Analytics Dashboard",
      description:
        "Show aggregated process metrics and KPIs from Prometheus with per-activity bottleneck breakdown.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processDefinitionKey: schemas.clusterCompareInput.shape.processDefinitionKey,
        period: schemas.elementBottleneckInput.shape.period,
        ...schemas.engineFilterShape,
      }),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const data = await queries.dashboardData(ch, {
        processDefinitionKey: args.processDefinitionKey,
        period: args.period,
        engine: args.engine,
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
        summary:
          `Analytics dashboard${args.processDefinitionKey ? ` for "${args.processDefinitionKey}"` : ""} ` +
          `over ${args.period}: ${data.totalCount} instances — ${data.completedCount} completed, ` +
          `${data.runningCount} running, ${data.failedCount} failed ` +
          `(${data.failureRatePct}% failure rate, ${data.incidentCount} incidents).`,
      })
    }),
  )

  // --- Failure Dashboard ---
  server.tool(
    {
      name: "analytics_show_failure_dashboard",
      title: "Failure Analysis Dashboard",
      description:
        "Show current incident/failure state from Prometheus, grouped by incident type, activity, and process definition (point-in-time — what is failing right now).",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        ...schemas.engineFilterShape,
      }),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const data = await queries.failureDashboardData(ch, {
        engine: args.engine,
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
        summary:
          `Failure dashboard: ${data.totalIncidents} open incident(s) across ` +
          `${data.uniqueErrorPatterns} error pattern(s)` +
          `${data.mostAffectedProcess ? `; most affected process: "${data.mostAffectedProcess}"` : ""}.`,
      })
    }),
  )

  // --- Cluster Compare (Pre/Post deployment diff) ---
  server.tool(
    {
      name: "analytics_show_cluster_compare",
      title: "Pre/Post Deployment Comparison",
      description:
        "Visualize before/after KPI deltas around a deployment timestamp. Results are flagged `suppressed` when either window has fewer than minBucketSize instances.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object(schemas.clusterCompareInput.shape),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const data = await queries.clusterCompare(ch, args)
      return buildSingleWidgetView({
        widget: "analytics:cluster-compare",
        app: "analytics",
        dataType: "analytics:clusterCompare",
        data,
        title: "Cluster Compare",
        summary:
          `Pre/post deployment comparison` +
          `${data.processDefinitionKey ? ` for "${data.processDefinitionKey}"` : ""} around ` +
          `${data.deploymentTimestamp}: ${compareDeltaSummary(data.delta)}` +
          `${suppressedNote(data.suppressed)}.`,
      })
    }),
  )

  // --- Version Compare (v1 vs v2 of one process) ---
  server.tool(
    {
      name: "analytics_show_version_compare",
      title: "Process Version Comparison",
      description:
        "Visualize KPI deltas between two deployed versions of the same processDefinitionKey within a shared time window. Results are flagged `suppressed` when either version has fewer than minBucketSize instances.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object(schemas.versionCompareInput.shape),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const data = await queries.versionCompare(ch, args)
      return buildSingleWidgetView({
        widget: "analytics:version-compare",
        app: "analytics",
        dataType: "analytics:versionCompare",
        data,
        title: "Version Compare",
        summary:
          `Version comparison for "${data.processDefinitionKey}" v${data.versionA} vs ` +
          `v${data.versionB} over ${data.windowDays}d: ${compareDeltaSummary(data.delta)}` +
          `${suppressedNote(data.suppressed)}.`,
      })
    }),
  )

  // --- Engine Compare (engine A vs engine B across the fleet) ---
  server.tool(
    {
      name: "analytics_show_engine_compare",
      title: "Engine Comparison",
      description:
        "Visualize KPI deltas between two CIB Seven engines (e.g. prod-a vs prod-b) over a shared time window. Optionally scope to one processDefinitionKey. Results are flagged `suppressed` when either engine has fewer than minBucketSize instances.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object(schemas.engineCompareInput.shape),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const data = await queries.engineCompare(ch, args)
      return buildSingleWidgetView({
        widget: "analytics:engine-compare",
        app: "analytics",
        dataType: "analytics:engineCompare",
        data,
        title: "Engine Compare",
        summary:
          `Engine comparison "${data.engineA}" vs "${data.engineB}"` +
          `${data.processDefinitionKey ? ` for "${data.processDefinitionKey}"` : ""} over ` +
          `${data.windowDays}d: ${compareDeltaSummary(data.delta)}${suppressedNote(data.suppressed)}.`,
      })
    }),
  )

  // --- BPMN Heatmap (per-element frequency + duration on the diagram) ---
  server.tool(
    {
      name: "analytics_show_bpmn_heatmap",
      title: "BPMN Heatmap",
      description:
        "Render a process definition's BPMN diagram with a per-element heat overlay from metrics, with a Frequency↔Duration toggle (traversal count vs average duration per element). Node-level only — sequence-flow/edge heat is not available from metrics — and rendered on the latest deployed version's diagram (activity metrics carry no version label). Needs the camunda7 client to fetch the BPMN XML; otherwise the widget shows a fallback.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object(heatmapInputShape),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const heat = await queries.elementHeat(ch, args)
      const bpmnXml = await fetchBpmnXml(args.processDefinitionKey)
      // Model summary only — the bpmnXml must never reach the text channel;
      // the widget renders the diagram from structuredContent.
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
        summary:
          `BPMN heatmap for "${args.processDefinitionKey}" over ${args.period}: ` +
          `heat values for ${Object.keys(heat.frequency).length} element(s)` +
          `${bpmnXml ? "" : " — no BPMN XML available, widget shows the non-diagram fallback"}.`,
      })
    }),
  )

  server.tool(
    {
      name: "analytics_bpmn_heatmap_data",
      title: "BPMN heatmap data (internal)",
      description:
        "Internal JSON feed (no UI) for the BPMN heatmap — per-element execution frequency + average duration over a window, plus the latest BPMN XML. Lets another widget (e.g. the CIB Seven cockpit) render the heatmap inline. Prefer analytics_show_bpmn_heatmap for a standalone view.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object(heatmapInputShape),
      // App-only (SEP-1865 visibility): hidden from the LLM on conforming
      // hosts, still callable from widgets via `callTool`. No `resourceUri` —
      // the feed returns JSON instead of rendering UI.
      _meta: APP_ONLY_META,
    },
    withToolErrors(async (args) => {
      const heat = await queries.elementHeat(ch, args)
      const bpmnXml = await fetchBpmnXml(args.processDefinitionKey)
      const data = {
        processDefinitionKey: args.processDefinitionKey,
        period: args.period,
        bpmnXml,
        frequency: heat.frequency,
        durationSec: heat.durationSec,
      }
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data }
    }),
  )
}
