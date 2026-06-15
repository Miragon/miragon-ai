import { z } from "zod"
import type { MCPServer } from "mcp-use/server"
import { APP_ONLY_META, uiMeta as buildUiMeta } from "@miragon/mcp-toolkit-core"
import {
  buildComposedView,
  buildSingleWidgetView,
  withToolErrors,
} from "@miragon-ai/widget-shell/server"
import type { ProcessListData, CockpitAppData, HistoryTimelineData } from "./view-models.js"
import {
  listIncidentsInput,
  listProcessDefinitionsInput,
  listProcessInstancesInput,
} from "@miragon-ai/client-cibseven/schemas"
import {
  getProcessDefinitions,
  getProcessInstance,
  getActivityInstanceTree,
  getIncidents,
  getHistoricActivityInstances,
  getHistoricProcessInstances,
  getProcessDefinitionBpmn20Xml,
  getActivityStatistics,
} from "@miragon-ai/client-cibseven/sdk"
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
import { collectActiveActivityIds, collectIncidentActivityIds } from "./lib/activity-tree.js"
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
  CAMUNDA7_SHOW_CLUSTER_DETAIL,
  CAMUNDA7_SHOW_COCKPIT_DASHBOARD,
  CAMUNDA7_SHOW_ENGINE_HEALTH,
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
 * Plain (no-UI) tool result carrying JSON data. The cockpit data feeds use this
 * so the app's in-widget `callTool` gets the data back — a widget-tool result
 * (with `_meta.ui.resourceUri`) is rendered by the host instead of being returned.
 */
function rawData(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>,
  }
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
          ? `Opened the CIB Seven cockpit on engine "${engineId}" (${data.engines.length} engine(s) configured). The user can navigate the process landscape client-side from here.`
          : `Opened the CIB Seven cockpit with an engine picker (${data.engines.length} engines configured, none selected).`,
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
        summary: `Process list: ${data.totalCount} deployed definition(s)${filters ? ` matching ${filters}` : ""} on engine "${engineId}".`,
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
      const { client, engineId } = resolveEngine(args.engine, registry)
      const data = await buildInstanceDetailData(client, engineId, {
        processInstanceId: args.processInstanceId,
      })
      const state = data.instance.ended ? "ended" : data.instance.suspended ? "suspended" : "active"
      return buildSingleWidgetView({
        widget: "camunda7:instance-detail",
        app: "camunda7",
        dataType: "camunda7:processInstance",
        data,
        title: "Process Instance",
        summary:
          `Process instance ${data.instance.id}` +
          `${data.instance.businessKey ? ` (business key "${data.instance.businessKey}")` : ""}: ` +
          `${state}, ${data.activeActivityIds.length} active activities, ` +
          `${data.incidents?.length ?? 0} open incidents, ${data.openTasks.length} open user tasks.`,
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
        summary:
          `${data.totalCount} running instance(s) of "${data.processDefinitionKey}" ` +
          `(${data.withIncidentCount} with incidents, ${data.suspendedCount} suspended); ` +
          `showing ${data.returnedCount} in the table.`,
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
      const { client, engineId, cockpitUrl } = resolveEngine(args.engine, registry)
      const engineEntry = registry.engines.find((e) => e.id === engineId)
      const data = await buildIncidentsDashboardData(client, {
        baseUrl: engineEntry?.baseUrl ?? "",
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
        summary:
          `Incidents dashboard: ${data.totalCount} open incident(s) across ` +
          `${data.processCount} process definition(s), ${data.last24hCount} in the last 24h.`,
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
      const { client, engineId, cockpitUrl } = resolveEngine(args.engine, registry)
      const engineEntry = registry.engines.find((e) => e.id === engineId)
      const data = await buildProcessIncidentsData(client, {
        baseUrl: engineEntry?.baseUrl ?? "",
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
        summary:
          `Process incidents for "${data.processDefinitionKey}"` +
          `${data.version != null ? ` v${data.version}` : ""}: ${data.incidentCount} open ` +
          `incident(s) across ${data.activities.length} activities, ${data.last24hCount} in the last 24h.`,
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
      const { client, engineId, cockpitUrl } = resolveEngine(args.engine, registry)
      const engineEntry = registry.engines.find((e) => e.id === engineId)
      const data = await buildIncidentDetailData(client, {
        baseUrl: engineEntry?.baseUrl ?? "",
        cockpitUrl,
        incidentId: args.incidentId,
      })
      return buildSingleWidgetView({
        widget: "camunda7:incident-detail",
        app: "camunda7",
        dataType: "camunda7:incidentDetail",
        data: { ...data, engineId },
        summary:
          `Incident ${data.incidentId} (${data.incidentType}) at activity ` +
          `"${data.activityName ?? data.activityId}" in "${data.processDefinitionKey}", ` +
          `instance ${data.processInstanceId}` +
          `${data.incidentMessage ? `: ${truncate(data.incidentMessage, 160)}` : ""}.`,
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
      const { client, engineId, cockpitUrl } = resolveEngine(args.engine, registry)
      const engineEntry = registry.engines.find((e) => e.id === engineId)
      const data = await buildProcessDetailData(client, {
        baseUrl: engineEntry?.baseUrl ?? "",
        cockpitUrl,
        processDefinitionKey: args.processDefinitionKey,
      })
      return buildSingleWidgetView({
        widget: "camunda7:process-detail",
        app: "camunda7",
        dataType: "camunda7:processDetail",
        data: { ...data, engineId },
        summary:
          `Process "${data.processDefinitionKey}"` +
          `${data.version != null ? ` v${data.version}` : ""}: ` +
          `${data.runningInstances ?? 0} running instance(s), ${data.openIncidents} open ` +
          `incident(s), ${data.failedJobs} failed job(s).`,
      })
    }),
  )

  server.tool(
    {
      name: "camunda7_show_history_timeline",
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
        summary:
          `History timeline for process instance ${args.processInstanceId}: ` +
          `${data.totalActivities} historic activities` +
          `${inst ? "" : " (no historic process instance found)"}.`,
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_SHOW_COCKPIT_DASHBOARD,
      title: "Cockpit Dashboard",
      description:
        "Show the Cockpit dashboard with process definition statistics: running instances, failed jobs, and incidents per definition.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({ ...engineParamShape }),
      _meta: uiMeta,
    },
    withToolErrors(async (args) => {
      const { client, engineId } = resolveEngine(args.engine, registry)
      const data = await buildCockpitDashboardData(client, engineId)
      return buildComposedView({
        app: "camunda7",
        title: "Cockpit Dashboard",
        layout: [
          { row: [{ widget: "camunda7:process-health-kpi" }] },
          { row: [{ widget: "camunda7:process-definitions-table" }] },
        ],
        entries: [{ dataType: "camunda7:cockpitDashboard", data }],
        summary:
          `Cockpit dashboard for engine "${engineId}": ${data.summary.totalDefinitions} ` +
          `definitions, ${data.summary.totalRunningInstances} running instances, ` +
          `${data.summary.totalFailedJobs} failed jobs, ${data.summary.totalIncidents} open incidents.`,
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
      const { client, engineId } = resolveEngine(args.engine, registry)
      const data = await buildEngineHealthData(client, engineId, healthThresholds)
      const top = data.clusters[0]
      return buildSingleWidgetView({
        widget: "camunda7:engine-health",
        app: "camunda7",
        dataType: "camunda7:engineHealth",
        data,
        title: "Engine Overview",
        summary:
          `Engine "${engineId}" — ${data.status}: ${data.summary.totalIncidents} open incidents ` +
          `across ${data.summary.affectedActivities} activities, ${data.summary.runningInstances} ` +
          `running instances.` +
          (top
            ? ` Top cluster: activity "${top.activityId}" / ${top.incidentType}, ${top.incidentCount} incidents.`
            : " No open incidents."),
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
        summary:
          `Failure cluster on engine "${engineId}": activity "${data.activityId}" / ` +
          `${data.incidentType} — ${data.incidentCount} incidents (${data.lastHourCount} in the ` +
          `last hour) across ${data.processDefinitionKeys.join(", ") || "unknown processes"}.` +
          (data.representativeMessage
            ? ` Sample: ${truncate(data.representativeMessage, 140)}`
            : ""),
      })
    }),
  )

  server.tool(
    {
      name: "camunda7_show_bpmn_viewer",
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
      const { client, engineId } = resolveEngine(args.engine, registry)
      const renderEmpty = (processInstanceId: string | null) =>
        buildComposedView({
          app: "camunda7",
          title: "BPMN Viewer",
          layout: [{ row: [{ widget: "camunda7:bpmn-viewer" }] }],
          entries: [
            {
              dataType: "camunda7:bpmnViewer",
              data: {
                bpmnXml: "",
                processInstanceId,
                processDefinitionId: null,
                activeActivityIds: [],
                incidentActivityIds: [],
                activityStats: [],
                engineId,
              },
            },
          ],
          summary: "BPMN viewer: no matching process definition found — rendered an empty diagram.",
        })

      let definitionId: string | null = null
      let processInstanceId: string | null = null

      if (args.processInstanceId) {
        processInstanceId = args.processInstanceId
        const instance = (await getProcessInstance({
          client,
          path: { id: args.processInstanceId },
        })) as { definitionId?: string } | null
        definitionId = instance?.definitionId ?? null
      } else if (args.processDefinitionKey) {
        const matches = await getProcessDefinitions({
          client,
          query: {
            key: args.processDefinitionKey,
            version: args.version,
            latestVersion: args.version === undefined ? true : undefined,
            maxResults: 1,
          },
        })
        const first = Array.isArray(matches) ? (matches[0] as { id?: string } | undefined) : null
        definitionId = first?.id ?? null
      }

      if (!definitionId) {
        return renderEmpty(processInstanceId)
      }

      const [xmlResponse, activityTree, incidents, stats] = await Promise.all([
        getProcessDefinitionBpmn20Xml({ client, path: { id: definitionId } }).catch(() => null),
        processInstanceId
          ? getActivityInstanceTree({ client, path: { id: processInstanceId } }).catch(() => null)
          : Promise.resolve(null),
        processInstanceId
          ? getIncidents({
              client,
              query: { processInstanceId, maxResults: 200 },
            }).catch(() => [])
          : Promise.resolve([]),
        getActivityStatistics({
          client,
          path: { id: definitionId },
          query: { failedJobs: true },
        }).catch(() => []),
      ])

      const bpmnXml = (xmlResponse as { bpmn20Xml?: string } | null)?.bpmn20Xml ?? ""

      const activeActivityIds = processInstanceId ? collectActiveActivityIds(activityTree) : []
      const incidentActivityIds = processInstanceId ? collectIncidentActivityIds(incidents) : []

      const statRows = Array.isArray(stats)
        ? (stats as Array<{ id?: string | null; instances?: number; failedJobs?: number }>)
        : []
      const activityStats = statRows.map((s) => ({
        id: s.id ?? "",
        instances: s.instances ?? 0,
        failedJobs: s.failedJobs ?? 0,
      }))

      // Model summary only — the (often tens-of-KB) bpmnXml must never reach
      // the text channel; the widget renders it from structuredContent.
      const totalFailedJobs = activityStats.reduce((sum, s) => sum + s.failedJobs, 0)
      const target = processInstanceId
        ? `process instance ${processInstanceId}`
        : `process definition ${definitionId}`
      const overlayInfo = processInstanceId
        ? `: ${activeActivityIds.length} active activities, ${incidentActivityIds.length} activities with incidents, ${totalFailedJobs} failed jobs`
        : ` (static diagram, no instance overlays)`
      return buildComposedView({
        app: "camunda7",
        title: "BPMN Viewer",
        layout: [{ row: [{ widget: "camunda7:bpmn-viewer" }] }],
        entries: [
          {
            dataType: "camunda7:bpmnViewer",
            data: {
              bpmnXml,
              processInstanceId,
              processDefinitionId: definitionId,
              activeActivityIds,
              incidentActivityIds,
              activityStats,
              engineId,
            },
          },
        ],
        summary: `Rendered the BPMN diagram for ${target}${overlayInfo}${bpmnXml ? "" : " — diagram XML unavailable"}.`,
      })
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
        summary:
          `Job panel: ${data.totalCount} job(s), ${data.failedCount} failed` +
          `${args.processDefinitionKey ? ` for "${args.processDefinitionKey}"` : ""}` +
          `${args.failedOnly ? " (failed only)" : ""}.`,
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
        "Internal JSON feed (no UI) for the cockpit overview — per-definition stats. Prefer camunda7_open_cockpit / camunda7_show_cockpit_dashboard.",
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
      const { client, engineId, cockpitUrl } = resolveEngine(args.engine, registry)
      const engineEntry = registry.engines.find((e) => e.id === engineId)
      const data = await buildProcessDetailData(client, {
        baseUrl: engineEntry?.baseUrl ?? "",
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
      const { client, engineId, cockpitUrl } = resolveEngine(args.engine, registry)
      const engineEntry = registry.engines.find((e) => e.id === engineId)
      const data = await buildIncidentsDashboardData(client, {
        baseUrl: engineEntry?.baseUrl ?? "",
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
      const { client, engineId, cockpitUrl } = resolveEngine(args.engine, registry)
      const engineEntry = registry.engines.find((e) => e.id === engineId)
      const data = await buildProcessIncidentsData(client, {
        baseUrl: engineEntry?.baseUrl ?? "",
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
      const { client, engineId, cockpitUrl } = resolveEngine(args.engine, registry)
      const engineEntry = registry.engines.find((e) => e.id === engineId)
      const data = await buildIncidentDetailData(client, {
        baseUrl: engineEntry?.baseUrl ?? "",
        cockpitUrl,
        incidentId: args.incidentId,
      })
      return rawData({ ...data, engineId })
    }),
  )
}
