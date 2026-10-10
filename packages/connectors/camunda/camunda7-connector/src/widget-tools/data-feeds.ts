import { z } from "zod"
// Feed payloads built as named interface types are spread at the call sites
// (`rawData({ ...data })`): the feed contract takes `Record<string, unknown>`,
// which interface types don't structurally satisfy.
import {
  appOnly,
  buildDataFeedResult as rawData,
  withToolErrors,
  strictToolInput,
} from "@miragon-ai/widget-shell/server"
import {
  buildCockpitDashboardData,
  buildJobPanelData,
  buildProcessInstancesData,
  buildProcessListData,
} from "../data/cockpit-data.js"
import { buildInstanceDetailData } from "../data/instance-detail-data.js"
import { buildClusterDetailData } from "../data/cluster-detail-data.js"
import { buildEngineHealthData } from "../data/health-data.js"
import { buildIncidentsDashboardData } from "../data/incidents-dashboard-data.js"
import {
  buildActivityIncidentsData,
  buildProcessIncidentsData,
} from "../data/process-incidents-data.js"
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
import {
  activityIncidentsFilterShape,
  incidentsDashboardFilterShape,
  jobsFilterShape,
  pagingShape,
  processInstancesFilterShape,
  processListFilterShape,
} from "../feed-contracts.js"
import { type WidgetToolsContext, clusterDetailShape } from "./shared.js"

/** The app-only `*_data` JSON feeds (SEP-1865) behind every widget above. */
export function registerWidgetDataFeeds(ctx: WidgetToolsContext) {
  const { server, registry, healthThresholds, engineParam } = ctx

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
      inputSchema: strictToolInput({ ...engineParam }),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const { client, engineId } = await resolveEngine(args.engine, registry, ctx)
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
      inputSchema: strictToolInput({ ...engineParam }),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const { client, engineId } = await resolveEngine(args.engine, registry, ctx)
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
      inputSchema: strictToolInput({ ...clusterDetailShape, ...engineParam }),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const { client, engineId } = await resolveEngine(args.engine, registry, ctx)
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
      inputSchema: strictToolInput({
        ...processInstancesFilterShape,
        ...pagingShape,
        ...engineParam,
      }),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const { client, engineId } = await resolveEngine(args.engine, registry, ctx)
      return rawData({
        ...(await buildProcessInstancesData(client, engineId, {
          processDefinitionKey: args.processDefinitionKey,
          active: args.active,
          suspended: args.suspended,
          withIncidents: args.withIncidents,
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
      inputSchema: strictToolInput({
        processInstanceId: z.string().optional().describe("Instance to overlay live state for."),
        processDefinitionKey: z.string().optional().describe("Definition for a version's diagram."),
        version: z.number().int().positive().optional(),
        ...engineParam,
      }),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const { client, engineId } = await resolveEngine(args.engine, registry, ctx)
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
      inputSchema: strictToolInput({
        ...processListFilterShape,
        ...pagingShape,
        ...engineParam,
      }),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const { client, engineId } = await resolveEngine(args.engine, registry, ctx)
      return rawData({
        ...(await buildProcessListData(client, engineId, {
          processDefinitionKey: args.processDefinitionKey,
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
      inputSchema: strictToolInput({
        processInstanceId: z.string().describe("The process instance ID"),
        ...engineParam,
      }),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const { client, engineId, baseUrl, cockpitUrl, provider } = await resolveEngine(
        args.engine,
        registry,
        ctx,
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
      inputSchema: strictToolInput({
        ...jobsFilterShape,
        ...pagingShape,
        ...engineParam,
      }),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const { client, engineId } = await resolveEngine(args.engine, registry, ctx)
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
      inputSchema: strictToolInput({
        ...incidentsDashboardFilterShape,
        ...engineParam,
      }),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const { client, engineId, baseUrl, cockpitUrl, provider } = await resolveEngine(
        args.engine,
        registry,
        ctx,
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
      inputSchema: strictToolInput({
        processDefinitionKey: z.string().describe("Process definition key to drill into"),
        ...engineParam,
      }),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const { client, engineId, baseUrl, cockpitUrl, provider } = await resolveEngine(
        args.engine,
        registry,
        ctx,
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
      inputSchema: strictToolInput({
        ...activityIncidentsFilterShape,
        ...pagingShape,
        ...engineParam,
      }),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const { client, engineId, baseUrl, cockpitUrl, provider } = await resolveEngine(
        args.engine,
        registry,
        ctx,
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
      inputSchema: strictToolInput({
        incidentId: z.string().describe("The incident ID to inspect"),
        ...engineParam,
      }),
      ...appOnly,
    },
    withToolErrors(async (args, ctx) => {
      const { client, engineId, baseUrl, cockpitUrl, provider } = await resolveEngine(
        args.engine,
        registry,
        ctx,
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
