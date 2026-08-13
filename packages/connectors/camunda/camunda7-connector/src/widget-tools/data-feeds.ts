import { z } from "zod"
// Feed payloads built as named interface types are spread at the call sites
// (`rawData({ ...data })`): the feed contract takes `Record<string, unknown>`,
// which interface types don't structurally satisfy.
import {
  appOnly,
  buildDataFeedResult as rawData,
  withToolErrors,
} from "@miragon-ai/widget-shell/server"
import {
  buildCockpitDashboardData,
  buildInstanceDetailData,
  buildJobPanelData,
  buildProcessInstancesData,
  buildProcessListData,
} from "../data/cockpit-data.js"
import { buildClusterDetailData, buildEngineHealthData } from "../data/health-data.js"
import {
  buildActivityIncidentsData,
  buildIncidentsDashboardData,
  buildProcessIncidentsData,
} from "../data/incident-panel-data.js"
import { buildIncidentDetailData } from "../data/incident-detail-data.js"
import { buildBpmnViewerData } from "../data/bpmn-viewer-data.js"
import {
  CAMUNDA7_ACTIVITY_INCIDENTS_DATA,
  CAMUNDA7_BPMN_VIEWER_DATA,
  CAMUNDA7_CLUSTER_DETAIL_DATA,
  CAMUNDA7_COCKPIT_OVERVIEW_DATA,
  CAMUNDA7_ENGINE_HEALTH_DATA,
  CAMUNDA7_INCIDENT_DETAIL_DATA,
  CAMUNDA7_INCIDENTS_DATA,
  CAMUNDA7_INSTANCE_DETAIL_DATA,
  CAMUNDA7_JOBS_DATA,
  CAMUNDA7_PROCESS_INCIDENTS_DATA,
  CAMUNDA7_PROCESS_INSTANCES_DATA,
  CAMUNDA7_PROCESS_LIST_DATA,
} from "../tool-names.js"
import { resolveEngine } from "../lib/resolve-engine.js"
import { engineParamShape } from "../lib/with-engine.js"
import {
  activityIncidentsFilterShape,
  jobsFilterShape,
  pagingShape,
  processInstancesFilterShape,
  processListFilterShape,
} from "../feed-contracts.js"
import {
  type WidgetToolsContext,
  clusterDetailShape,
  incidentsDashboardFilterShape,
} from "./shared.js"

/** The app-only `*_data` JSON feeds (SEP-1865) behind every widget above. */
export function registerWidgetDataFeeds(ctx: WidgetToolsContext) {
  const { server, registry, healthThresholds } = ctx

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
      inputSchema: z.object({ ...engineParamShape }),
      ...appOnly,
    },
    withToolErrors(async (args) => {
      const { client, engineId } = await resolveEngine(args.engine, registry)
      return rawData({ ...(await buildCockpitDashboardData(client, engineId)) })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_ENGINE_HEALTH_DATA,
      title: "Engine health data (internal)",
      description:
        "Internal JSON feed (no UI) for the engine health verdict + incident clusters. Prefer camunda7_show_engine_health / camunda7_open_cockpit.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({ ...engineParamShape }),
      ...appOnly,
    },
    withToolErrors(async (args) => {
      const { client, engineId } = await resolveEngine(args.engine, registry)
      return rawData({ ...(await buildEngineHealthData(client, engineId, healthThresholds)) })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_CLUSTER_DETAIL_DATA,
      title: "Cluster detail data (internal)",
      description:
        "Internal JSON feed (no UI) for one failure cluster's detail. Prefer camunda7_show_cluster_detail.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({ ...clusterDetailShape, ...engineParamShape }),
      ...appOnly,
    },
    withToolErrors(async (args) => {
      const { client, engineId } = await resolveEngine(args.engine, registry)
      return rawData({
        ...(await buildClusterDetailData(client, engineId, {
          activityId: args.activityId,
          incidentType: args.incidentType,
          messageSignature: args.messageSignature,
          businessKeyLike: args.businessKeyLike,
          firstResult: args.firstResult,
          maxResults: args.maxResults,
        })),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_PROCESS_INSTANCES_DATA,
      title: "Process instances data (internal)",
      description:
        "Internal JSON feed (no UI) for a definition's running instances. Prefer camunda7_show_process_instances.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        ...processInstancesFilterShape,
        ...pagingShape,
        ...engineParamShape,
      }),
      ...appOnly,
    },
    withToolErrors(async (args) => {
      const { client, engineId } = await resolveEngine(args.engine, registry)
      return rawData({
        ...(await buildProcessInstancesData(client, engineId, {
          processDefinitionKey: args.processDefinitionKey,
          active: args.active,
          suspended: args.suspended,
          withIncidentsOnly: args.withIncidentsOnly,
          businessKeyLike: args.businessKeyLike,
          firstResult: args.firstResult,
          maxResults: args.maxResults,
        })),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_BPMN_VIEWER_DATA,
      title: "BPMN viewer data (internal)",
      description:
        "Internal JSON feed (no UI) for the BPMN viewer — diagram XML plus live overlays. Prefer camunda7_show_bpmn_viewer.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        processInstanceId: z.string().optional().describe("Instance to overlay live state for."),
        processDefinitionKey: z.string().optional().describe("Definition for a static diagram."),
        version: z.number().int().positive().optional(),
        ...engineParamShape,
      }),
      ...appOnly,
    },
    withToolErrors(async (args) => {
      const { client, engineId } = await resolveEngine(args.engine, registry)
      return rawData({
        ...(await buildBpmnViewerData(client, engineId, {
          processInstanceId: args.processInstanceId,
          processDefinitionKey: args.processDefinitionKey,
          version: args.version,
        })),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_PROCESS_LIST_DATA,
      title: "Process list data (internal)",
      description:
        "Internal JSON feed (no UI) for deployed process definitions, offset-paged. Prefer camunda7_show_process_list.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        ...processListFilterShape,
        ...pagingShape,
        ...engineParamShape,
      }),
      ...appOnly,
    },
    withToolErrors(async (args) => {
      const { client, engineId } = await resolveEngine(args.engine, registry)
      return rawData({
        ...(await buildProcessListData(client, engineId, {
          key: args.key,
          nameLike: args.nameLike,
          latestVersion: args.latestVersion,
          firstResult: args.firstResult,
          maxResults: args.maxResults,
        })),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_INSTANCE_DETAIL_DATA,
      title: "Instance detail data (internal)",
      description:
        "Internal JSON feed (no UI) for a single process instance. Prefer camunda7_show_instance_detail.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        processInstanceId: z.string().describe("The process instance ID"),
        ...engineParamShape,
      }),
      ...appOnly,
    },
    withToolErrors(async (args) => {
      const { client, engineId, baseUrl, cockpitUrl, provider } = await resolveEngine(
        args.engine,
        registry,
      )
      return rawData({
        ...(await buildInstanceDetailData(
          client,
          engineId,
          { processInstanceId: args.processInstanceId },
          { baseUrl, cockpitUrl, provider },
        )),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_JOBS_DATA,
      title: "Jobs data (internal)",
      description: "Internal JSON feed (no UI) for jobs. Prefer camunda7_show_job_panel.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        ...jobsFilterShape,
        ...pagingShape,
        ...engineParamShape,
      }),
      ...appOnly,
    },
    withToolErrors(async (args) => {
      const { client, engineId } = await resolveEngine(args.engine, registry)
      return rawData({
        ...(await buildJobPanelData(client, engineId, {
          processDefinitionKey: args.processDefinitionKey,
          failedOnly: args.failedOnly,
          firstResult: args.firstResult,
          maxResults: args.maxResults,
        })),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_INCIDENTS_DATA,
      title: "Incidents dashboard data (internal)",
      description:
        "Internal JSON feed (no UI) for the incidents dashboard — open incidents grouped by process. Prefer camunda7_show_incidents_dashboard.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        ...incidentsDashboardFilterShape,
        ...engineParamShape,
      }),
      ...appOnly,
    },
    withToolErrors(async (args) => {
      const { client, engineId, baseUrl, cockpitUrl, provider } = await resolveEngine(
        args.engine,
        registry,
      )
      const data = await buildIncidentsDashboardData(client, {
        baseUrl,
        cockpitUrl,
        provider,
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
        "Internal JSON feed (no UI) for the unified definition view — header, KPIs (incl. failed jobs), BPMN overlays, activity-grouped incidents. Prefer camunda7_show_process_detail / camunda7_show_process_incidents.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        processDefinitionKey: z.string().describe("Process definition key to drill into"),
        ...engineParamShape,
      }),
      ...appOnly,
    },
    withToolErrors(async (args) => {
      const { client, engineId, baseUrl, cockpitUrl, provider } = await resolveEngine(
        args.engine,
        registry,
      )
      const data = await buildProcessIncidentsData(client, {
        baseUrl,
        cockpitUrl,
        provider,
        processDefinitionKey: args.processDefinitionKey,
      })
      return rawData({ ...data, engineId })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_ACTIVITY_INCIDENTS_DATA,
      title: "Activity incidents data (internal)",
      description:
        "Internal JSON feed (no UI) for one activity's incident rows, offset-paged. Prefer camunda7_show_process_incidents.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        ...activityIncidentsFilterShape,
        ...pagingShape,
        ...engineParamShape,
      }),
      ...appOnly,
    },
    withToolErrors(async (args) => {
      const { client, engineId, baseUrl, cockpitUrl, provider } = await resolveEngine(
        args.engine,
        registry,
      )
      const data = await buildActivityIncidentsData(client, {
        baseUrl,
        cockpitUrl,
        provider,
        processDefinitionKey: args.processDefinitionKey,
        activityId: args.activityId,
        firstResult: args.firstResult,
        maxResults: args.maxResults,
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
      inputSchema: z.object({
        incidentId: z.string().describe("The incident ID to inspect"),
        ...engineParamShape,
      }),
      ...appOnly,
    },
    withToolErrors(async (args) => {
      const { client, engineId, baseUrl, cockpitUrl, provider } = await resolveEngine(
        args.engine,
        registry,
      )
      const data = await buildIncidentDetailData(client, {
        baseUrl,
        cockpitUrl,
        provider,
        incidentId: args.incidentId,
      })
      return rawData({ ...data, engineId })
    }),
  )
}
