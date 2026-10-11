import type { MCPServer } from "mcp-use"
import {
  appOnly,
  buildComposedView,
  buildDataFeedResult,
  buildSingleWidgetView,
  showToolBinding,
  withToolErrors,
  strictToolInput,
} from "@miragon-ai/widget-shell/server"
import {
  queries,
  schemas,
  withCallerSignal,
  type AnalyticsDashboardData,
  type PrometheusClient,
} from "@miragon-ai/analytics-client"
import {
  ANALYTICS_BPMN_HEATMAP_DATA,
  ANALYTICS_DASHBOARD_DATA,
  ANALYTICS_FAILURE_DASHBOARD_DATA,
} from "./tool-names.js"
import { localizeFor, type ProfileSource, type ServerT } from "./server-locale.js"
import { optionalPeriod, settingsFor } from "./settings.js"
import { registerComparisonWidgetTools } from "./widget-tools/comparisons.js"
import { engineScopeSummary } from "./widget-tools/shared.js"
import { isFleetRequest, withEngineScope, type AnalyticsEngineScope } from "./engine-ids.js"

/**
 * Engine-agnostic BPMN-XML lookup injected by the host app (which owns the
 * engine client) — this module never talks to an engine itself. Resolves the
 * latest deployed version's diagram XML for a process definition key, or
 * `null` when unavailable.
 */
export type FetchBpmnXml = (processDefinitionKey: string) => Promise<string | null>

export interface AnalyticsWidgetToolsOptions {
  /** The server's configured engine ids — every query resolves `engine` through it. */
  engineScope: AnalyticsEngineScope
  /** Used by the BPMN heatmap to fetch the diagram XML. Absent → non-diagram fallback. */
  fetchBpmnXml?: FetchBpmnXml
  /**
   * Profile store: locale for model-facing summaries plus the caller's saved
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

/** Dashboard + its feed: one input shape, so the self-fetch can carry every scope the show tool takes. */
const dashboardInputShape = {
  processDefinitionKey: schemas.clusterCompareInput.shape.processDefinitionKey,
  period: optionalPeriod,
  ...schemas.engineFilterShape,
}

/** "n/a" for a figure that was not measured — never a plausible 0. */
const orNa = (value: number | null) => value ?? "n/a"

/** The model-facing dashboard summary: window flows and the live state, never mixed. */
function dashboardSummary(t: ServerT, data: AnalyticsDashboardData, fleet: boolean): string {
  return t("aSum.dashboard", {
    scope: data.processDefinitionKey
      ? t("aSum.scopeForProcess", { key: data.processDefinitionKey })
      : "",
    period: data.period,
    engines: engineScopeSummary(t, data.engines, fleet),
    totalCount: data.totalCount,
    completedCount: data.completedCount,
    incidentsCreated: data.incidentsCreated,
    incidentRatePct: orNa(data.incidentRatePct),
    runningNow: orNa(data.runningNow),
    openIncidentsNow: orNa(data.openIncidentsNow),
  })
}

export function registerWidgetTools(
  server: MCPServer,
  ch: PrometheusClient,
  options: AnalyticsWidgetToolsOptions,
) {
  // Resolve the request locale via `await localizeFor(profileStore, ctx)` inside
  // each handler to localize its model-facing `summary` (→ "en" without a store
  // or a caller identity).
  const { profileStore, engineScope } = options

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
        "Show process metrics from Prometheus: flows within the period (starts, completions, incidents created/resolved, durations of the instances that ended) and the live state right now (instances running, incidents open), per process definition and per (process, activity).",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: strictToolInput(dashboardInputShape),
      ...showToolBinding("analytics_show_dashboard", "Process Analytics Dashboard"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const period = args.period ?? (await settingsFor(profileStore, ctx)).defaultPeriod
      const data = await queries.dashboardData(withCallerSignal(ch, ctx.signal), {
        ...withEngineScope(engineScope, args),
        period,
      })
      // The RESOLVED period and the requested scope travel as cell props, so a
      // widget that self-fetches (structuredContent stripped, a saved view)
      // reads the same scope instead of the fleet default.
      const cellProps = {
        period,
        ...(args.processDefinitionKey ? { processDefinitionKey: args.processDefinitionKey } : {}),
        ...(isFleetRequest(args.engine) ? {} : { engine: args.engine }),
      }
      return buildComposedView({
        app: "analytics",
        // The view title in the caller's language (the widget heading's own key).
        title: t("aExecSummary.title"),
        layout: [
          { row: [{ widget: "analytics:execution-summary-kpi", props: cellProps }] },
          { row: [{ widget: "analytics:execution-performance-kpi", props: cellProps }] },
          { row: [{ widget: "analytics:process-definition-breakdown", props: cellProps }] },
          { row: [{ widget: "analytics:activity-bottleneck-table", props: cellProps }] },
        ],
        entries: [{ dataType: "analytics:dashboard", data }],
        summary: dashboardSummary(t, data, isFleetRequest(args.engine)),
      })
    }),
  )

  // --- Failure Dashboard ---
  server.tool(
    {
      name: "analytics_show_failure_dashboard",
      title: "Failure Analysis Dashboard",
      description:
        "Show the incidents open right now from Prometheus, grouped by incident type and process definition (no activity, message or timestamps), with each affected process's running instances and dead jobs. Use to show the metric view to the user; for one engine's live incident clusters use camunda7_show_engine_health.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: strictToolInput({
        ...schemas.engineFilterShape,
      }),
      ...showToolBinding("analytics_show_failure_dashboard", "Failure Analysis Dashboard"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const data = await queries.failureDashboardData(
        withCallerSignal(ch, ctx.signal),
        withEngineScope(engineScope, args),
      )
      // The requested scope travels as cell props so a self-fetch keeps it.
      const cellProps = isFleetRequest(args.engine) ? undefined : { engine: args.engine }
      return buildComposedView({
        app: "analytics",
        title: t("aFailureSummary.title"),
        layout: [
          { row: [{ widget: "analytics:failure-summary-kpi", props: cellProps }] },
          { row: [{ widget: "analytics:error-patterns-table", props: cellProps }] },
          { row: [{ widget: "analytics:failure-rate-table", props: cellProps }] },
        ],
        entries: [{ dataType: "analytics:failureDashboard", data }],
        summary: t("aSum.failureDashboard", {
          engines: engineScopeSummary(t, data.engines, isFleetRequest(args.engine)),
          totalIncidents: data.totalIncidents,
          uniqueErrorPatterns: data.uniqueErrorPatterns,
          mostAffected: data.mostAffectedProcess
            ? t("aSum.mostAffectedProcess", { key: data.mostAffectedProcess })
            : "",
        }),
      })
    }),
  )

  registerComparisonWidgetTools({ server, ch, engineScope, profileStore })

  // --- BPMN Heatmap (per-element frequency + duration on the diagram) ---
  server.tool(
    {
      name: "analytics_show_bpmn_heatmap",
      title: "BPMN Heatmap",
      description:
        "Render a process definition's BPMN diagram with a per-element heat overlay from metrics, with a Frequency↔Duration toggle (traversal count vs average duration per element). Node-level only — sequence-flow/edge heat is not available from metrics — and rendered on the latest deployed version's diagram (activity metrics carry no version label). Needs the camunda7 client to fetch the BPMN XML; otherwise the widget shows a fallback.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: strictToolInput(heatmapInputShape),
      ...showToolBinding("analytics_show_bpmn_heatmap", "BPMN Heatmap"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const period = args.period ?? (await settingsFor(profileStore, ctx)).defaultPeriod
      const scoped = withEngineScope(engineScope, args)
      const heat = await queries.elementHeat(withCallerSignal(ch, ctx.signal), {
        ...scoped,
        period,
      })
      const bpmnXml = await fetchBpmnXml(args.processDefinitionKey)
      // Model summary only — the bpmnXml must never reach the text channel;
      // the widget renders the diagram from structuredContent.
      return buildSingleWidgetView({
        widget: "analytics:bpmn-heatmap",
        app: "analytics",
        dataType: "analytics:bpmnHeatmap",
        // `AnalyticsBpmnHeatmapData` (widgets/bpmn-heatmap.tsx): the engines
        // travel with the heat, so the model description names them.
        data: {
          processDefinitionKey: args.processDefinitionKey,
          period,
          engines: scoped.engine,
          bpmnXml,
          frequency: heat.frequency,
          durationSec: heat.durationSec,
          asOf: heat.asOf,
        },
        title: t("aHeatmap.title"),
        summary: t("aSum.bpmnHeatmap", {
          key: args.processDefinitionKey,
          period,
          engines: engineScopeSummary(t, scoped.engine, isFleetRequest(args.engine)),
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
      inputSchema: strictToolInput(heatmapInputShape),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const period = args.period ?? (await settingsFor(profileStore, ctx)).defaultPeriod
      const scoped = withEngineScope(engineScope, args)
      const heat = await queries.elementHeat(withCallerSignal(ch, ctx.signal), {
        ...scoped,
        period,
      })
      const bpmnXml = await fetchBpmnXml(args.processDefinitionKey)
      const data = {
        processDefinitionKey: args.processDefinitionKey,
        period,
        engines: scoped.engine,
        bpmnXml,
        frequency: heat.frequency,
        durationSec: heat.durationSec,
        asOf: heat.asOf,
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
      inputSchema: strictToolInput(dashboardInputShape),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const period = args.period ?? (await settingsFor(profileStore, ctx)).defaultPeriod
      const data = await queries.dashboardData(withCallerSignal(ch, ctx.signal), {
        ...withEngineScope(engineScope, args),
        period,
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
      inputSchema: strictToolInput({
        ...schemas.engineFilterShape,
      }),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const data = await queries.failureDashboardData(
        withCallerSignal(ch, ctx.signal),
        withEngineScope(engineScope, args),
      )
      return buildDataFeedResult({ ...data })
    }),
  )
}
