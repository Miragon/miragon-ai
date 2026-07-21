import { z } from "zod"
import type { MCPServer } from "mcp-use/server"
import { APP_ONLY_META, uiMeta as buildUiMeta } from "@miragon/mcp-toolkit-core"
import {
  buildComposedView,
  buildDataFeedResult as rawData,
  buildSingleWidgetView,
  withToolErrors,
} from "@miragon-ai/widget-shell/server"
import type { ProcessListData, CockpitAppData, HistoryTimelineData } from "./view-models.js"
import {
  listIncidentsInput,
  listProcessDefinitionsInput,
  listProcessInstancesInput,
} from "@miragon-ai/client-camunda7/schemas"
import {
  getProcessDefinitions,
  getHistoricActivityInstances,
  getHistoricProcessInstances,
} from "@miragon-ai/client-camunda7/sdk"
import {
  buildCockpitDashboardData,
  buildInstanceDetailData,
  buildJobPanelData,
  buildProcessInstancesData,
} from "./data/cockpit-data.js"
import {
  buildClusterDetailData,
  buildEngineHealthData,
  DEFAULT_HEALTH_THRESHOLDS,
  type EngineHealthThresholds,
} from "./data/health-data.js"
import {
  buildIncidentsDashboardData,
  buildProcessIncidentsData,
} from "./data/incident-panel-data.js"
import { buildProcessDetailData } from "./data/process-detail-data.js"
import { buildIncidentDetailData } from "./data/incident-detail-data.js"
import { buildBpmnViewerData } from "./data/bpmn-viewer-data.js"
import {
  CAMUNDA7_CLUSTER_DETAIL_DATA,
  CAMUNDA7_COCKPIT_OVERVIEW_DATA,
  CAMUNDA7_ENGINE_HEALTH_DATA,
  CAMUNDA7_INCIDENT_DETAIL_DATA,
  CAMUNDA7_INCIDENTS_DATA,
  CAMUNDA7_INSTANCE_DETAIL_DATA,
  CAMUNDA7_JOBS_DATA,
  CAMUNDA7_OPEN_COCKPIT,
  CAMUNDA7_PROCESS_DETAIL_DATA,
  CAMUNDA7_PROCESS_INCIDENTS_DATA,
  CAMUNDA7_PROCESS_INSTANCES_DATA,
  CAMUNDA7_SHOW_BPMN_VIEWER,
  CAMUNDA7_SHOW_CLUSTER_DETAIL,
  CAMUNDA7_SHOW_ENGINE_HEALTH,
  CAMUNDA7_SHOW_HISTORY_TIMELINE,
  CAMUNDA7_SHOW_INCIDENT_DETAIL,
  CAMUNDA7_SHOW_INCIDENTS_DASHBOARD,
  CAMUNDA7_SHOW_INSTANCE_DETAIL,
  CAMUNDA7_SHOW_JOB_PANEL,
  CAMUNDA7_SHOW_PROCESS_DETAIL,
  CAMUNDA7_SHOW_PROCESS_INCIDENTS,
  CAMUNDA7_SHOW_PROCESS_INSTANCES,
  CAMUNDA7_SHOW_PROCESS_LIST,
} from "./tool-names.js"
import { resolveEngine, type EngineRegistry } from "./lib/resolve-engine.js"
import { engineParamShape } from "./lib/with-engine.js"
import { createInMemoryProfileStore, type ProfileStore } from "./lib/profile-store.js"
import { localizeFor } from "./lib/server-locale.js"

/**
 * Filters shared by `camunda7_show_incidents_dashboard` and its
 * `camunda7_incidents_data` feed, composed from the exported client schemas
 * (like the registrar tools) so the describe() texts stay in one place.
 */
const incidentsDashboardFilterShape = {
  processDefinitionKey: listProcessInstancesInput.shape.processDefinitionKey,
  incidentType: listIncidentsInput.shape.incidentType,
}

/**
 * App-only marker for the internal `*_data` feeds (SEP-1865
 * `_meta.ui.visibility`). Conforming hosts hide these tools from the LLM tool
 * surface while keeping them callable from widgets via `callTool`; the
 * "Internal JSON feed" descriptions stay as fallback for non-conforming hosts.
 * Deliberately no `resourceUri` — the feeds must return JSON, not render UI.
 */
const appOnlyMeta = APP_ONLY_META

/** One-line truncation for summaries (incident messages can be stacktrace-sized). */
function truncate(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

export interface Camunda7WidgetToolsOptions {
  /** Per-deployment overrides for the engine-health traffic-light thresholds. */
  healthThresholds?: Partial<EngineHealthThresholds>
  /** Profile store for localizing model-facing summaries (locale → profile language). */
  profileStore?: ProfileStore
}

export function registerWidgetTools(
  server: MCPServer,
  registry: EngineRegistry,
  resourceUri: string,
  options: Camunda7WidgetToolsOptions = {},
) {
  const uiMeta = buildUiMeta({ resourceUri })
  const healthThresholds: EngineHealthThresholds = {
    ...DEFAULT_HEALTH_THRESHOLDS,
    ...options.healthThresholds,
  }
  // Resolve the request locale via `await localizeFor(profileStore)` inside each
  // handler to localize its model-facing `summary`. Falls back to an empty
  // in-memory store (→ locale "en") when none is injected (tests/embeds).
  const profileStore = options.profileStore ?? createInMemoryProfileStore()

  server.tool(
    {
      name: CAMUNDA7_OPEN_COCKPIT,
      title: "Open Cockpit",
      description:
        "Open the consolidated CIB Seven operations cockpit — a single app that navigates client-side (no extra tool calls) across the process landscape: overview, per-definition running instances, instance detail, plus quick access to human tasks, jobs and deployments. The Support entry point.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({ ...engineParamShape }),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const t = await localizeFor(profileStore)
      // Thin bootstrap: resolve the engine (sticky selection or the only engine)
      // and hand the app the engine list. The app threads the chosen engineId
      // into every nested tool call via the `engine` override, so client-side
      // navigation works without relying on the session's sticky selection.
      let engineId: string | null = null
      try {
        engineId = resolveEngine(args.engine, registry).engineId
      } catch {
        // Multiple engines, none selected → the app renders an engine picker.
        engineId = null
      }
      const data: CockpitAppData = {
        engineId,
        engines: registry.engines.map((e) => ({ id: e.id, baseUrl: e.baseUrl })),
      }
      return buildSingleWidgetView({
        widget: "camunda7:cockpit-app",
        app: "camunda7",
        dataType: "camunda7:cockpitApp",
        data,
        title: "Cockpit",
        summary: engineId
          ? t("c7sum.cockpitOpened", { engineId, engineCount: data.engines.length })
          : t("c7sum.cockpitOpenedPicker", { engineCount: data.engines.length }),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_SHOW_PROCESS_LIST,
      title: "Process Definitions",
      description: "Show deployed process definitions as a card grid view.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        key: listProcessDefinitionsInput.shape.key,
        nameLike: listProcessDefinitionsInput.shape.nameLike,
        latestVersion: listProcessDefinitionsInput.shape.latestVersion.default(true),
        ...engineParamShape,
      }),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const t = await localizeFor(profileStore)
      const { client, engineId } = resolveEngine(args.engine, registry)
      const definitions = await getProcessDefinitions({
        client,
        query: {
          key: args.key,
          nameLike: args.nameLike,
          latestVersion: args.latestVersion,
          maxResults: 100,
          sortBy: "name",
          sortOrder: "asc",
        },
      })
      const defArray = Array.isArray(definitions) ? definitions : []
      const data: ProcessListData = {
        definitions: defArray as ProcessListData["definitions"],
        totalCount: defArray.length,
        engineId,
      }
      const filters = [
        args.key && `key "${args.key}"`,
        args.nameLike && `name like "${args.nameLike}"`,
      ]
        .filter(Boolean)
        .join(" and ")
      return buildSingleWidgetView({
        widget: "camunda7:process-list",
        app: "camunda7",
        dataType: "camunda7:processDefinitionList",
        data,
        title: "Process Definitions",
        summary: t("c7sum.processList", {
          totalCount: data.totalCount,
          filters: filters ? ` matching ${filters}` : "",
          engineId,
        }),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_SHOW_INSTANCE_DETAIL,
      title: "Process Instance Detail",
      description:
        "Show detailed view of a single process instance with activity tree, variables, and incidents.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processInstanceId: z.string().describe("The process instance ID to inspect"),
        ...engineParamShape,
      }),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const t = await localizeFor(profileStore)
      const { client, engineId } = resolveEngine(args.engine, registry)
      const data = await buildInstanceDetailData(client, engineId, {
        processInstanceId: args.processInstanceId,
      })
      const state = data.instance.ended
        ? t("c7sum.state.ended")
        : data.instance.suspended
          ? t("c7sum.state.suspended")
          : t("c7sum.state.active")
      return buildSingleWidgetView({
        widget: "camunda7:instance-detail",
        app: "camunda7",
        dataType: "camunda7:processInstance",
        data,
        title: "Process Instance",
        summary: t("c7sum.instanceDetail", {
          instanceId: data.instance.id,
          businessKey: data.instance.businessKey
            ? ` (business key "${data.instance.businessKey}")`
            : "",
          state,
          activeActivities: data.activeActivityIds.length,
          openIncidents: data.incidents?.length ?? 0,
          openTasks: data.openTasks.length,
        }),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_SHOW_PROCESS_INSTANCES,
      title: "Process Instances",
      description:
        "List the running process instances of a process definition as a filterable table (business key, version, suspended/incident state). Drill-in target from the cockpit definitions table and process-detail; each row opens camunda7_show_instance_detail.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processDefinitionKey: z.string().describe("Process definition key whose instances to list"),
        active: z.boolean().optional().describe("Only running (non-suspended) instances."),
        suspended: z.boolean().optional().describe("Only suspended instances."),
        withIncidentsOnly: z
          .boolean()
          .optional()
          .describe("Only instances that currently have an open incident."),
        businessKeyLike: z
          .string()
          .optional()
          .describe("Filter by a substring of the business key."),
        maxResults: z.number().optional().default(50),
        ...engineParamShape,
      }),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const t = await localizeFor(profileStore)
      const { client, engineId } = resolveEngine(args.engine, registry)
      const data = await buildProcessInstancesData(client, engineId, {
        processDefinitionKey: args.processDefinitionKey,
        active: args.active,
        suspended: args.suspended,
        withIncidentsOnly: args.withIncidentsOnly,
        businessKeyLike: args.businessKeyLike,
        maxResults: args.maxResults,
      })
      return buildSingleWidgetView({
        widget: "camunda7:process-instances",
        app: "camunda7",
        dataType: "camunda7:processInstances",
        data,
        title: "Process Instances",
        summary: t("c7sum.processInstances", {
          totalCount: data.totalCount,
          processDefinitionKey: data.processDefinitionKey,
          withIncidentCount: data.withIncidentCount,
          suspendedCount: data.suspendedCount,
          returnedCount: data.returnedCount,
        }),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_SHOW_INCIDENTS_DASHBOARD,
      title: "Incidents Dashboard",
      description:
        "Overview of open incidents across all process definitions: KPIs, filter, per-process group cards with activity summaries. From a card the operator can drill into the per-process detail view.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        ...incidentsDashboardFilterShape,
        ...engineParamShape,
      }),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const t = await localizeFor(profileStore)
      const { client, engineId, baseUrl, cockpitUrl } = resolveEngine(args.engine, registry)
      const data = await buildIncidentsDashboardData(client, {
        baseUrl,
        cockpitUrl,
        processDefinitionKey: args.processDefinitionKey,
        incidentType: args.incidentType,
      })
      return buildComposedView({
        app: "camunda7",
        layout: [
          { row: [{ widget: "camunda7:incident-overview-kpi" }] },
          { row: [{ widget: "camunda7:incident-process-list" }] },
        ],
        entries: [{ dataType: "camunda7:incidentsDashboard", data: { ...data, engineId } }],
        summary: t("c7sum.incidentsDashboard", {
          totalCount: data.totalCount,
          processCount: data.processCount,
          last24hCount: data.last24hCount,
        }),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_SHOW_PROCESS_INCIDENTS,
      title: "Process Incidents",
      description:
        "Per-process incident detail: header, KPIs, BPMN diagram with incident overlays, and activity-grouped incident table with per-incident actions (resolve, jump to Cockpit).",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processDefinitionKey: z.string().describe("Process definition key to drill into"),
        ...engineParamShape,
      }),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const t = await localizeFor(profileStore)
      const { client, engineId, baseUrl, cockpitUrl } = resolveEngine(args.engine, registry)
      const data = await buildProcessIncidentsData(client, {
        baseUrl,
        cockpitUrl,
        processDefinitionKey: args.processDefinitionKey,
      })
      return buildComposedView({
        app: "camunda7",
        layout: [
          { row: [{ widget: "camunda7:process-detail-header" }] },
          { row: [{ widget: "camunda7:process-incident-kpi" }] },
          { row: [{ widget: "camunda7:process-incident-flow" }] },
          { row: [{ widget: "camunda7:activity-incident-list" }] },
        ],
        entries: [{ dataType: "camunda7:processIncidents", data: { ...data, engineId } }],
        summary: t("c7sum.processIncidents", {
          processDefinitionKey: data.processDefinitionKey,
          version: data.version != null ? ` v${data.version}` : "",
          incidentCount: data.incidentCount,
          activities: data.activities.length,
          last24hCount: data.last24hCount,
        }),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_SHOW_INCIDENT_DETAIL,
      title: "Incident Detail",
      description:
        "Detail view for a single incident: failure stacktrace, BPMN with the failing activity highlighted, instance variables and activity tree, and a history timeline. Drill-in target from camunda7_show_process_incidents.",
      // Read-only view: the tool only reads data. Mutations (resolve/retry) happen
      // via separate tool calls from inside the widget, not from this tool.
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        incidentId: z.string().describe("The incident ID to inspect"),
        ...engineParamShape,
      }),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const t = await localizeFor(profileStore)
      const { client, engineId, baseUrl, cockpitUrl } = resolveEngine(args.engine, registry)
      const data = await buildIncidentDetailData(client, {
        baseUrl,
        cockpitUrl,
        incidentId: args.incidentId,
      })
      return buildSingleWidgetView({
        widget: "camunda7:incident-detail",
        app: "camunda7",
        dataType: "camunda7:incidentDetail",
        data: { ...data, engineId },
        summary: t("c7sum.incidentDetail", {
          incidentId: data.incidentId,
          incidentType: data.incidentType,
          activity: data.activityName ?? data.activityId,
          processDefinitionKey: data.processDefinitionKey,
          processInstanceId: data.processInstanceId,
          message: data.incidentMessage ? `: ${truncate(data.incidentMessage, 160)}` : "",
        }),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_SHOW_PROCESS_DETAIL,
      title: "Process Definition Detail",
      description:
        "Detail view for a single process definition: tinted header, boxed KPI grid, BPMN flow with incident overlays. Drill-in target from cockpit-dashboard rows; can hand off to camunda7_show_process_incidents for the per-incident table.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processDefinitionKey: z.string().describe("Process definition key to display"),
        ...engineParamShape,
      }),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const t = await localizeFor(profileStore)
      const { client, engineId, baseUrl, cockpitUrl } = resolveEngine(args.engine, registry)
      const data = await buildProcessDetailData(client, {
        baseUrl,
        cockpitUrl,
        processDefinitionKey: args.processDefinitionKey,
      })
      return buildSingleWidgetView({
        widget: "camunda7:process-detail",
        app: "camunda7",
        dataType: "camunda7:processDetail",
        data: { ...data, engineId },
        summary: t("c7sum.processDetail", {
          processDefinitionKey: data.processDefinitionKey,
          version: data.version != null ? ` v${data.version}` : "",
          runningInstances: data.runningInstances ?? 0,
          openIncidents: data.openIncidents,
          failedJobs: data.failedJobs,
        }),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_SHOW_HISTORY_TIMELINE,
      title: "History Timeline",
      description: "Show activity timeline for a process instance.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processInstanceId: z.string().describe("The process instance ID"),
        ...engineParamShape,
      }),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const t = await localizeFor(profileStore)
      const { client, engineId } = resolveEngine(args.engine, registry)
      const [activities, instances] = await Promise.all([
        getHistoricActivityInstances({
          client,
          query: {
            processInstanceId: args.processInstanceId,
            sortBy: "startTime",
            sortOrder: "asc",
            maxResults: 500,
          },
        }),
        getHistoricProcessInstances({
          client,
          query: { processInstanceId: args.processInstanceId, maxResults: 1 },
        }),
      ])

      const instArray = (
        Array.isArray(instances) ? instances : []
      ) as HistoryTimelineData["processInstance"][]
      const actArray = (
        Array.isArray(activities) ? activities : []
      ) as HistoryTimelineData["activities"]
      const inst = instArray[0] ?? null

      const data: HistoryTimelineData = {
        processInstance: inst,
        activities: actArray,
        totalActivities: actArray.length,
        engineId,
      }
      return buildSingleWidgetView({
        widget: "camunda7:history-timeline",
        app: "camunda7",
        dataType: "camunda7:historyTimeline",
        data,
        title: "History Timeline",
        summary: t("c7sum.historyTimeline", {
          processInstanceId: args.processInstanceId,
          totalActivities: data.totalActivities,
          notFound: inst ? "" : t("c7sum.historyTimeline.notFound"),
        }),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_SHOW_ENGINE_HEALTH,
      title: "Engine Health Overview",
      description:
        "Show the AI-first engine overview: a deterministic health verdict (ok / degraded / critical) with running-instance and incident KPIs and the top incident clusters, grouped cross-process by failing activity + incident type. The home base for triaging what is wrong on a CIB Seven / Camunda 7 engine — each cluster drills in or hands off to AI for root cause + remediation.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({ ...engineParamShape }),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const t = await localizeFor(profileStore)
      const { client, engineId } = resolveEngine(args.engine, registry)
      const data = await buildEngineHealthData(client, engineId, healthThresholds)
      const top = data.clusters[0]
      return buildSingleWidgetView({
        widget: "camunda7:engine-health",
        app: "camunda7",
        dataType: "camunda7:engineHealth",
        data,
        title: "Engine Overview",
        summary: t("c7sum.engineHealth", {
          engineId,
          status: data.status,
          totalIncidents: data.summary.totalIncidents,
          affectedActivities: data.summary.affectedActivities,
          runningInstances: data.summary.runningInstances,
          topCluster: top
            ? t("c7sum.engineHealth.topCluster", {
                activityId: top.activityId,
                incidentType: top.incidentType,
                incidentCount: top.incidentCount,
              })
            : t("c7sum.engineHealth.noIncidents"),
        }),
      })
    }),
  )

  // Shared by the cluster-detail show tool + its data feed.
  const clusterDetailShape = {
    activityId: z.string().describe("Activity id of the failure cluster."),
    incidentType: z.string().describe('Incident type of the cluster, e.g. "failedJob".'),
    messageSignature: z
      .string()
      .optional()
      .describe(
        "Normalized failure-message signature (as produced by the engine-health clusters). Omitted → all messages for this activity + type.",
      ),
  }

  server.tool(
    {
      name: CAMUNDA7_SHOW_CLUSTER_DETAIL,
      title: "Failure Cluster Detail",
      description:
        "Drill into ONE failure cluster: the affected process instances (business keys first), the full sample failure message, and the time profile (new in last hour / 24h) for an activity failing with a given incident type. The middle layer between the engine health overview and a single incident's detail.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({ ...clusterDetailShape, ...engineParamShape }),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const t = await localizeFor(profileStore)
      const { client, engineId } = resolveEngine(args.engine, registry)
      const data = await buildClusterDetailData(client, engineId, {
        activityId: args.activityId,
        incidentType: args.incidentType,
        messageSignature: args.messageSignature,
      })
      return buildSingleWidgetView({
        widget: "camunda7:cluster-detail",
        app: "camunda7",
        dataType: "camunda7:clusterDetail",
        data,
        title: `Cluster: ${data.activityId}`,
        summary: t("c7sum.clusterDetail", {
          engineId,
          activityId: data.activityId,
          incidentType: data.incidentType,
          incidentCount: data.incidentCount,
          lastHourCount: data.lastHourCount,
          processes:
            data.processDefinitionKeys.join(", ") || t("c7sum.clusterDetail.unknownProcesses"),
          sample: data.representativeMessage
            ? t("c7sum.clusterDetail.sample", {
                message: truncate(data.representativeMessage, 140),
              })
            : "",
        }),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_SHOW_BPMN_VIEWER,
      title: "BPMN Diagram Viewer",
      description:
        "Show an interactive BPMN diagram. Pass `processInstanceId` to overlay active activities, incidents, and failed-job counts for a running instance, or pass `processDefinitionKey` (with optional `version`) to view the diagram of a process definition without instance overlays.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z
        .object({
          processInstanceId: z
            .string()
            .optional()
            .describe("Process instance ID. Renders diagram with live overlays."),
          processDefinitionKey: z
            .string()
            .optional()
            .describe("Process definition key. Renders the static diagram (no overlays)."),
          version: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
              "Specific definition version. Requires `processDefinitionKey`. Defaults to the latest version when omitted.",
            ),
          ...engineParamShape,
        })
        .refine((v) => v.processInstanceId || v.processDefinitionKey, {
          message: "Provide either `processInstanceId` or `processDefinitionKey`.",
        })
        .refine((v) => !v.version || v.processDefinitionKey, {
          message: "`version` requires `processDefinitionKey`.",
          path: ["version"],
        }),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const t = await localizeFor(profileStore)
      const { client, engineId } = resolveEngine(args.engine, registry)
      // Shared builder with the `camunda7:load-bpmn-viewer` step — the two
      // render paths must stay in sync (data/bpmn-viewer-data.ts).
      const data = await buildBpmnViewerData(client, engineId, {
        processInstanceId: args.processInstanceId,
        processDefinitionKey: args.processDefinitionKey,
        version: args.version,
      })

      const view = (summary: string) =>
        buildComposedView({
          app: "camunda7",
          title: "BPMN Viewer",
          layout: [{ row: [{ widget: "camunda7:bpmn-viewer" }] }],
          entries: [{ dataType: "camunda7:bpmnViewer", data }],
          summary,
        })

      if (!data.processDefinitionId) {
        return view(t("c7sum.bpmnViewer.empty"))
      }

      // Model summary only — the (often tens-of-KB) bpmnXml must never reach
      // the text channel; the widget renders it from structuredContent.
      const totalFailedJobs = data.activityStats.reduce((sum, s) => sum + s.failedJobs, 0)
      const target = data.processInstanceId
        ? t("c7sum.bpmnViewer.targetInstance", { processInstanceId: data.processInstanceId })
        : t("c7sum.bpmnViewer.targetDefinition", { definitionId: data.processDefinitionId })
      const overlayInfo = data.processInstanceId
        ? t("c7sum.bpmnViewer.overlays", {
            activeActivities: data.activeActivityIds.length,
            incidentActivities: data.incidentActivityIds.length,
            failedJobs: totalFailedJobs,
          })
        : t("c7sum.bpmnViewer.noOverlays")
      return view(
        t("c7sum.bpmnViewer", {
          target,
          overlayInfo,
          xmlUnavailable: data.bpmnXml ? "" : t("c7sum.bpmnViewer.xmlUnavailable"),
        }),
      )
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_SHOW_JOB_PANEL,
      title: "Job Management Panel",
      description:
        "Show jobs with a focus on failed jobs (no retries left). Displays error messages and retry status.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
        failedOnly: z.boolean().optional().default(false).describe("Show only failed jobs"),
        ...engineParamShape,
      }),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const t = await localizeFor(profileStore)
      const { client, engineId } = resolveEngine(args.engine, registry)
      const data = await buildJobPanelData(client, engineId, {
        processDefinitionKey: args.processDefinitionKey,
        failedOnly: args.failedOnly,
      })
      return buildSingleWidgetView({
        widget: "camunda7:job-panel",
        app: "camunda7",
        dataType: "camunda7:jobPanel",
        title: "Job Panel",
        data,
        summary: t("c7sum.jobPanel", {
          totalCount: data.totalCount,
          failedCount: data.failedCount,
          forProcess: args.processDefinitionKey
            ? t("c7sum.jobPanel.forProcess", { processDefinitionKey: args.processDefinitionKey })
            : "",
          failedOnly: args.failedOnly ? t("c7sum.jobPanel.failedOnly") : "",
        }),
      })
    }),
  )

  // ── Per-view data feeds (plain, no UI) ──────────────────────────────────
  // Reused by the cockpit app's loaders AND each widget's own self-fetch. Each
  // delegates to the shared builder in cockpit-data.ts (same logic the matching
  // camunda7_show_* widget tool uses for its eager render).

  server.tool(
    {
      name: CAMUNDA7_COCKPIT_OVERVIEW_DATA,
      title: "Cockpit overview data (internal)",
      description:
        "Internal JSON feed (no UI) for the cockpit overview — per-definition stats. Prefer camunda7_open_cockpit.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({ ...engineParamShape }),
      _meta: appOnlyMeta,
    },
    withToolErrors(async (args) => {
      const { client, engineId } = resolveEngine(args.engine, registry)
      return rawData(await buildCockpitDashboardData(client, engineId))
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_ENGINE_HEALTH_DATA,
      title: "Engine health data (internal)",
      description:
        "Internal JSON feed (no UI) for the engine health verdict + incident clusters. Prefer camunda7_show_engine_health / camunda7_open_cockpit.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({ ...engineParamShape }),
      _meta: appOnlyMeta,
    },
    withToolErrors(async (args) => {
      const { client, engineId } = resolveEngine(args.engine, registry)
      return rawData(await buildEngineHealthData(client, engineId, healthThresholds))
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_CLUSTER_DETAIL_DATA,
      title: "Cluster detail data (internal)",
      description:
        "Internal JSON feed (no UI) for one failure cluster's detail. Prefer camunda7_show_cluster_detail.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({ ...clusterDetailShape, ...engineParamShape }),
      _meta: appOnlyMeta,
    },
    withToolErrors(async (args) => {
      const { client, engineId } = resolveEngine(args.engine, registry)
      return rawData(
        await buildClusterDetailData(client, engineId, {
          activityId: args.activityId,
          incidentType: args.incidentType,
          messageSignature: args.messageSignature,
        }),
      )
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_PROCESS_DETAIL_DATA,
      title: "Process detail data (internal)",
      description:
        "Internal JSON feed (no UI) for a process definition's detail. Prefer camunda7_show_process_detail.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processDefinitionKey: z.string().describe("Process definition key"),
        ...engineParamShape,
      }),
      _meta: appOnlyMeta,
    },
    withToolErrors(async (args) => {
      const { client, engineId, baseUrl, cockpitUrl } = resolveEngine(args.engine, registry)
      const data = await buildProcessDetailData(client, {
        baseUrl,
        cockpitUrl,
        processDefinitionKey: args.processDefinitionKey,
      })
      return rawData({ ...data, engineId })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_PROCESS_INSTANCES_DATA,
      title: "Process instances data (internal)",
      description:
        "Internal JSON feed (no UI) for a definition's running instances. Prefer camunda7_show_process_instances.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processDefinitionKey: z.string().describe("Process definition key"),
        active: z.boolean().optional(),
        suspended: z.boolean().optional(),
        withIncidentsOnly: z.boolean().optional(),
        businessKeyLike: z.string().optional(),
        firstResult: z.number().optional().describe("Offset for pagination (0-based)"),
        maxResults: z.number().optional(),
        ...engineParamShape,
      }),
      _meta: appOnlyMeta,
    },
    withToolErrors(async (args) => {
      const { client, engineId } = resolveEngine(args.engine, registry)
      return rawData(
        await buildProcessInstancesData(client, engineId, {
          processDefinitionKey: args.processDefinitionKey,
          active: args.active,
          suspended: args.suspended,
          withIncidentsOnly: args.withIncidentsOnly,
          businessKeyLike: args.businessKeyLike,
          firstResult: args.firstResult,
          maxResults: args.maxResults,
        }),
      )
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_INSTANCE_DETAIL_DATA,
      title: "Instance detail data (internal)",
      description:
        "Internal JSON feed (no UI) for a single process instance. Prefer camunda7_show_instance_detail.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processInstanceId: z.string().describe("The process instance ID"),
        ...engineParamShape,
      }),
      _meta: appOnlyMeta,
    },
    withToolErrors(async (args) => {
      const { client, engineId } = resolveEngine(args.engine, registry)
      return rawData(
        await buildInstanceDetailData(client, engineId, {
          processInstanceId: args.processInstanceId,
        }),
      )
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_JOBS_DATA,
      title: "Jobs data (internal)",
      description: "Internal JSON feed (no UI) for jobs. Prefer camunda7_show_job_panel.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processDefinitionKey: z.string().optional(),
        failedOnly: z.boolean().optional(),
        firstResult: z.number().optional().describe("Offset for pagination (0-based)"),
        maxResults: z.number().optional(),
        ...engineParamShape,
      }),
      _meta: appOnlyMeta,
    },
    withToolErrors(async (args) => {
      const { client, engineId } = resolveEngine(args.engine, registry)
      return rawData(
        await buildJobPanelData(client, engineId, {
          processDefinitionKey: args.processDefinitionKey,
          failedOnly: args.failedOnly,
          firstResult: args.firstResult,
          maxResults: args.maxResults,
        }),
      )
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_INCIDENTS_DATA,
      title: "Incidents dashboard data (internal)",
      description:
        "Internal JSON feed (no UI) for the incidents dashboard — open incidents grouped by process. Prefer camunda7_show_incidents_dashboard.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        ...incidentsDashboardFilterShape,
        ...engineParamShape,
      }),
      _meta: appOnlyMeta,
    },
    withToolErrors(async (args) => {
      const { client, engineId, baseUrl, cockpitUrl } = resolveEngine(args.engine, registry)
      const data = await buildIncidentsDashboardData(client, {
        baseUrl,
        cockpitUrl,
        processDefinitionKey: args.processDefinitionKey,
        incidentType: args.incidentType,
      })
      return rawData({ ...data, engineId })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_PROCESS_INCIDENTS_DATA,
      title: "Process incidents data (internal)",
      description:
        "Internal JSON feed (no UI) for a single definition's incidents — header, KPIs, BPMN overlays, activity-grouped incidents. Prefer camunda7_show_process_incidents.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processDefinitionKey: z.string().describe("Process definition key to drill into"),
        ...engineParamShape,
      }),
      _meta: appOnlyMeta,
    },
    withToolErrors(async (args) => {
      const { client, engineId, baseUrl, cockpitUrl } = resolveEngine(args.engine, registry)
      const data = await buildProcessIncidentsData(client, {
        baseUrl,
        cockpitUrl,
        processDefinitionKey: args.processDefinitionKey,
      })
      return rawData({ ...data, engineId })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_INCIDENT_DETAIL_DATA,
      title: "Incident detail data (internal)",
      description:
        "Internal JSON feed (no UI) for a single incident — stacktrace, BPMN with the failing activity, variables, activity tree, history. Prefer camunda7_show_incident_detail.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        incidentId: z.string().describe("The incident ID to inspect"),
        ...engineParamShape,
      }),
      _meta: appOnlyMeta,
    },
    withToolErrors(async (args) => {
      const { client, engineId, baseUrl, cockpitUrl } = resolveEngine(args.engine, registry)
      const data = await buildIncidentDetailData(client, {
        baseUrl,
        cockpitUrl,
        incidentId: args.incidentId,
      })
      return rawData({ ...data, engineId })
    }),
  )
}
