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
  ANALYTICS_BPMN_XML_DATA,
  ANALYTICS_DASHBOARD_DATA,
  ANALYTICS_FAILURE_DASHBOARD_DATA,
} from "./tool-names.js"
import { localizeViewFor, type ProfileSource, type ServerT } from "./server-locale.js"
import { optionalPeriod, settingsFor } from "./settings.js"
import { registerComparisonWidgetTools } from "./widget-tools/comparisons.js"
import { engineScopeSummary } from "./widget-tools/shared.js"
import { isFleetRequest, withEngineScope, type AnalyticsEngineScope } from "./engine-ids.js"
import type { BpmnMissingReason } from "./heatmap-data.js"
import { NO_NAMES, type FetchBpmnXml, type NameLookup } from "./bpmn-name-lookup.js"
import { namedDashboard, namedFailureDashboard } from "./named-views.js"

export type { FetchBpmnXml } from "./bpmn-name-lookup.js"

export interface AnalyticsWidgetToolsOptions {
  /** The server's configured engine ids — every query resolves `engine` through it. */
  engineScope: AnalyticsEngineScope
  /** Used by the BPMN heatmap to fetch the diagram XML. Absent → non-diagram fallback. */
  fetchBpmnXml?: FetchBpmnXml
  /**
   * The process and element names behind the ids the dashboards list
   * (`createNameLookup` over the same BPMN lookup). Absent → the ids.
   */
  namesFor?: NameLookup
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
  // Each show tool words its result via `await localizeViewFor(profileStore, ctx)`:
  // `t` for the model-facing `summary` (→ "en" without a store or a caller
  // identity), `title` for the view title, set only in a language the profile
  // names (the kit's one rule for every module, #322 U3).
  const { profileStore, engineScope } = options
  const namesFor = options.namesFor ?? NO_NAMES

  /**
   * Fetches the latest deployed version's BPMN XML for the heatmap overlay via
   * the injected lookup, from the engines whose heat it shows, in
   * configuration order: the first that has the model draws it, so a process
   * that runs only on a later engine still gets its diagram. Without a
   * lookup, or when every engine fails or finds nothing, the XML is `null`
   * and `bpmnMissing` says which of the two happened, so the widget's
   * fallback names the known cause (`heatmap-data.ts`).
   */
  async function loadBpmn(
    processDefinitionKey: string,
    engines: readonly string[],
  ): Promise<{ bpmnXml: string | null; bpmnMissing?: BpmnMissingReason }> {
    const fetchBpmnXml = options.fetchBpmnXml
    if (!fetchBpmnXml) return { bpmnXml: null, bpmnMissing: "no-camunda7" }
    for (const engine of engines.length > 0 ? engines : [undefined]) {
      const bpmnXml = await fetchBpmnXml(processDefinitionKey, engine).catch(() => null)
      if (bpmnXml) return { bpmnXml }
    }
    return { bpmnXml: null, bpmnMissing: "not-loaded" }
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
      const { t, title } = await localizeViewFor(profileStore, ctx)
      const settings = await settingsFor(profileStore, ctx)
      const period = args.period ?? settings.defaultPeriod
      const data = await namedDashboard(
        await queries.dashboardData(withCallerSignal(ch, ctx.signal), {
          ...withEngineScope(engineScope, args),
          period,
          minBucketSize: settings.minBucketSize,
        }),
        namesFor,
      )
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
        // The view title in the language the profile names (the widget heading's
        // own key); none with "system", where the heading names the view.
        title: title("aExecSummary.title"),
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
      const { t, title } = await localizeViewFor(profileStore, ctx)
      const data = await namedFailureDashboard(
        await queries.failureDashboardData(
          withCallerSignal(ch, ctx.signal),
          withEngineScope(engineScope, args),
        ),
        namesFor,
      )
      // The requested scope travels as cell props so a self-fetch keeps it.
      const cellProps = isFleetRequest(args.engine) ? undefined : { engine: args.engine }
      return buildComposedView({
        app: "analytics",
        title: title("aFailureSummary.title"),
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

  registerComparisonWidgetTools({ server, ch, engineScope, profileStore, namesFor })

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
      const { t, title } = await localizeViewFor(profileStore, ctx)
      const period = args.period ?? (await settingsFor(profileStore, ctx)).defaultPeriod
      const scoped = withEngineScope(engineScope, args)
      const heat = await queries.elementHeat(withCallerSignal(ch, ctx.signal), {
        ...scoped,
        period,
      })
      // Read here only to know whether a diagram exists (and why not); the
      // XML stays out of the payload — the widget reads it from
      // `analytics_bpmn_xml_data` (cached by the camunda7 lookup).
      const bpmn = await loadBpmn(args.processDefinitionKey, scoped.engine)
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
          ...(bpmn.bpmnMissing ? { bpmnMissing: bpmn.bpmnMissing } : {}),
          frequency: heat.frequency,
          durationSec: heat.durationSec,
          asOf: heat.asOf,
        },
        title: title("aHeatmap.title"),
        summary: t("aSum.bpmnHeatmap", {
          key: args.processDefinitionKey,
          period,
          engines: engineScopeSummary(t, scoped.engine, isFleetRequest(args.engine)),
          elementCount: Object.keys(heat.frequency).length,
          fallbackNote: bpmn.bpmnXml ? "" : t("aSum.bpmnHeatmapNoXml"),
        }),
      })
    }),
  )

  server.tool(
    {
      name: ANALYTICS_BPMN_HEATMAP_DATA,
      title: "BPMN heatmap data (internal)",
      description:
        "Internal JSON feed (no UI) for the BPMN heatmap — per-element execution frequency + average duration over a window. Lets another widget (e.g. the CIB Seven cockpit) paint the heat on its own diagram. Prefer analytics_show_bpmn_heatmap for a standalone view.",
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
      const data = {
        processDefinitionKey: args.processDefinitionKey,
        period,
        engines: scoped.engine,
        frequency: heat.frequency,
        durationSec: heat.durationSec,
        asOf: heat.asOf,
      }
      return buildDataFeedResult(data)
    }),
  )

  server.tool(
    {
      name: ANALYTICS_BPMN_XML_DATA,
      title: "BPMN heatmap diagram (internal)",
      description:
        "Internal JSON feed (no UI): the latest deployed BPMN XML of a process key on the engines in scope, for the heatmap view's diagram.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: strictToolInput({
        processDefinitionKey: heatmapInputShape.processDefinitionKey,
        ...schemas.engineFilterShape,
      }),
      ...appOnly,
    },
    withToolErrors(async (args) => {
      const scoped = withEngineScope(engineScope, args)
      return buildDataFeedResult({
        processDefinitionKey: args.processDefinitionKey,
        ...(await loadBpmn(args.processDefinitionKey, scoped.engine)),
      })
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
      const settings = await settingsFor(profileStore, ctx)
      const data = await namedDashboard(
        await queries.dashboardData(withCallerSignal(ch, ctx.signal), {
          ...withEngineScope(engineScope, args),
          period: args.period ?? settings.defaultPeriod,
          minBucketSize: settings.minBucketSize,
        }),
        namesFor,
      )
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
      const data = await namedFailureDashboard(
        await queries.failureDashboardData(
          withCallerSignal(ch, ctx.signal),
          withEngineScope(engineScope, args),
        ),
        namesFor,
      )
      return buildDataFeedResult({ ...data })
    }),
  )
}
