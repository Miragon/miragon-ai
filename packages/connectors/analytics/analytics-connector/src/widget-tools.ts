import { z } from "zod"
import type { MCPServer } from "mcp-use"
import {
  appOnly,
  buildComposedView,
  buildDataFeedResult,
  buildSingleWidgetView,
  showToolBinding,
  withToolErrors,
} from "@miragon-ai/widget-shell/server"
import { queries, schemas, type PrometheusClient } from "@miragon-ai/analytics-client"
import {
  ANALYTICS_BPMN_HEATMAP_DATA,
  ANALYTICS_DASHBOARD_DATA,
  ANALYTICS_FAILURE_DASHBOARD_DATA,
} from "./tool-names.js"
import { localizeFor, type ProfileSource } from "./server-locale.js"
import { optionalPeriod, settingsFor } from "./settings.js"
import { registerComparisonWidgetTools } from "./widget-tools/comparisons.js"

/**
 * Engine-agnostic BPMN-XML lookup injected by the host app (which owns the
 * engine client) — this module never talks to an engine itself. Resolves the
 * latest deployed version's diagram XML for a process definition key, or
 * `null` when unavailable.
 */
export type FetchBpmnXml = (processDefinitionKey: string) => Promise<string | null>

export interface AnalyticsWidgetToolsOptions {
  /** Used by the BPMN heatmap to fetch the diagram XML. Absent → non-diagram fallback. */
  fetchBpmnXml?: FetchBpmnXml
  /**
   * Profile store: locale for model-facing summaries plus the session's saved
   * analytics defaults (`modules.analytics`) — the "explicit arg > saved
   * setting > schema default" resolution for `period`/`minBucketSize`.
   */
  profileStore?: ProfileSource
}

/**
 * Heatmap inputs shared by `analytics_show_bpmn_heatmap` and its
 * `analytics_bpmn_heatmap_data` feed, composed from the exported client
 * schemas so the describe() texts stay in one place.
 */
const heatmapInputShape = {
  processDefinitionKey: schemas.elementBottleneckInput.shape.processDefinitionKey,
  period: optionalPeriod,
  ...schemas.engineFilterShape,
}

export function registerWidgetTools(
  server: MCPServer,
  ch: PrometheusClient,
  options: AnalyticsWidgetToolsOptions = {},
) {
  // Resolve the request locale via `await localizeFor(profileStore)` inside each
  // handler to localize its model-facing `summary` (→ "en" when no store/session).
  const profileStore = options.profileStore

  /**
   * Fetches the latest deployed version's BPMN XML for the heatmap overlay via
   * the injected lookup. Returns `null` without an injected fetcher or on any
   * fetch error — the widget renders its non-diagram fallback in that case.
   */
  async function fetchBpmnXml(processDefinitionKey: string): Promise<string | null> {
    if (!options.fetchBpmnXml) return null
    return (await options.fetchBpmnXml(processDefinitionKey).catch(() => null)) ?? null
  }

  // --- Process Analytics Dashboard ---
  server.tool(
    {
      name: "analytics_show_dashboard",
      title: "Process Analytics Dashboard",
      description:
        "Show aggregated process metrics and KPIs from Prometheus with per-activity bottleneck breakdown.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        processDefinitionKey: schemas.clusterCompareInput.shape.processDefinitionKey,
        period: optionalPeriod,
        ...schemas.engineFilterShape,
      }),
      ...showToolBinding("analytics_show_dashboard", "Process Analytics Dashboard"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const period = args.period ?? (await settingsFor(profileStore, ctx)).defaultPeriod
      const data = await queries.dashboardData(ch, {
        processDefinitionKey: args.processDefinitionKey,
        period,
        engine: args.engine,
      })
      // The RESOLVED scope travels as cell props so the widgets' model
      // descriptions report the period actually queried (profile default
      // included), not a guessed fallback.
      const cellProps = {
        period,
        ...(args.processDefinitionKey ? { processDefinitionKey: args.processDefinitionKey } : {}),
        ...(args.engine ? { engine: args.engine } : {}),
      }
      return buildComposedView({
        app: "analytics",
        title: "Analytics Dashboard",
        layout: [
          { row: [{ widget: "analytics:execution-summary-kpi", props: cellProps }] },
          { row: [{ widget: "analytics:execution-performance-kpi", props: cellProps }] },
          { row: [{ widget: "analytics:process-definition-breakdown", props: cellProps }] },
          { row: [{ widget: "analytics:activity-bottleneck-table", props: cellProps }] },
        ],
        entries: [{ dataType: "analytics:dashboard", data }],
        summary: t("aSum.dashboard", {
          scope: args.processDefinitionKey
            ? t("aSum.scopeForProcess", { key: args.processDefinitionKey })
            : "",
          period,
          totalCount: data.totalCount,
          completedCount: data.completedCount,
          runningCount: data.runningCount,
          failedCount: data.failedCount,
          failureRatePct: data.failureRatePct,
          incidentCount: data.incidentCount,
        }),
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
      inputSchema: z.object({
        ...schemas.engineFilterShape,
      }),
      ...showToolBinding("analytics_show_failure_dashboard", "Failure Analysis Dashboard"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
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
        summary: t("aSum.failureDashboard", {
          totalIncidents: data.totalIncidents,
          uniqueErrorPatterns: data.uniqueErrorPatterns,
          mostAffected: data.mostAffectedProcess
            ? t("aSum.mostAffectedProcess", { key: data.mostAffectedProcess })
            : "",
        }),
      })
    }),
  )

  registerComparisonWidgetTools({ server, ch, profileStore })

  // --- BPMN Heatmap (per-element frequency + duration on the diagram) ---
  server.tool(
    {
      name: "analytics_show_bpmn_heatmap",
      title: "BPMN Heatmap",
      description:
        "Render a process definition's BPMN diagram with a per-element heat overlay from metrics, with a Frequency↔Duration toggle (traversal count vs average duration per element). Node-level only — sequence-flow/edge heat is not available from metrics — and rendered on the latest deployed version's diagram (activity metrics carry no version label). Needs the camunda7 client to fetch the BPMN XML; otherwise the widget shows a fallback.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object(heatmapInputShape),
      ...showToolBinding("analytics_show_bpmn_heatmap", "BPMN Heatmap"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const period = args.period ?? (await settingsFor(profileStore, ctx)).defaultPeriod
      const heat = await queries.elementHeat(ch, { ...args, period })
      const bpmnXml = await fetchBpmnXml(args.processDefinitionKey)
      // Model summary only — the bpmnXml must never reach the text channel;
      // the widget renders the diagram from structuredContent.
      return buildSingleWidgetView({
        widget: "analytics:bpmn-heatmap",
        app: "analytics",
        dataType: "analytics:bpmnHeatmap",
        data: {
          processDefinitionKey: args.processDefinitionKey,
          period,
          bpmnXml,
          frequency: heat.frequency,
          durationSec: heat.durationSec,
        },
        title: "BPMN Heatmap",
        summary: t("aSum.bpmnHeatmap", {
          key: args.processDefinitionKey,
          period,
          elementCount: Object.keys(heat.frequency).length,
          fallbackNote: bpmnXml ? "" : t("aSum.bpmnHeatmapNoXml"),
        }),
      })
    }),
  )

  server.tool(
    {
      name: ANALYTICS_BPMN_HEATMAP_DATA,
      title: "BPMN heatmap data (internal)",
      description:
        "Internal JSON feed (no UI) for the BPMN heatmap — per-element execution frequency + average duration over a window, plus the latest BPMN XML. Lets another widget (e.g. the CIB Seven cockpit) render the heatmap inline. Prefer analytics_show_bpmn_heatmap for a standalone view.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object(heatmapInputShape),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const period = args.period ?? (await settingsFor(profileStore, ctx)).defaultPeriod
      const heat = await queries.elementHeat(ch, { ...args, period })
      const bpmnXml = await fetchBpmnXml(args.processDefinitionKey)
      const data = {
        processDefinitionKey: args.processDefinitionKey,
        period,
        bpmnXml,
        frequency: heat.frequency,
        durationSec: heat.durationSec,
      }
      return buildDataFeedResult(data)
    }),
  )

  // ── Per-view data feeds (plain, no UI) ──────────────────────────────────
  // Backing the dashboard widgets' self-fetch. Self-fetching a show_* tool
  // instead would be host-defined behavior: hosts honoring
  // `resultCanProduceWidget` may render a second widget per refresh, and the
  // show tool's localized model summary is generated for a call the model
  // never sees.

  server.tool(
    {
      name: ANALYTICS_DASHBOARD_DATA,
      title: "Analytics dashboard data (internal)",
      description:
        "Internal JSON feed (no UI) for the analytics dashboard widgets' self-fetch. Prefer analytics_show_dashboard.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        processDefinitionKey: schemas.clusterCompareInput.shape.processDefinitionKey,
        period: optionalPeriod,
        ...schemas.engineFilterShape,
      }),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const period = args.period ?? (await settingsFor(profileStore, ctx)).defaultPeriod
      const data = await queries.dashboardData(ch, {
        processDefinitionKey: args.processDefinitionKey,
        period,
        engine: args.engine,
      })
      return buildDataFeedResult({ ...data })
    }),
  )

  server.tool(
    {
      name: ANALYTICS_FAILURE_DASHBOARD_DATA,
      title: "Failure dashboard data (internal)",
      description:
        "Internal JSON feed (no UI) for the failure dashboard widgets' self-fetch. Prefer analytics_show_failure_dashboard.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        ...schemas.engineFilterShape,
      }),
      ...appOnly,
    },
    withToolErrors(async (args) => {
      const data = await queries.failureDashboardData(ch, { engine: args.engine })
      return buildDataFeedResult({ ...data })
    }),
  )
}
