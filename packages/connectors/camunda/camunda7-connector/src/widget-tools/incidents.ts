import { z } from "zod"
// Feed payloads built as named interface types are spread at the call sites
// (`rawData({ ...data })`): the feed contract takes `Record<string, unknown>`,
// which interface types don't structurally satisfy.
import {
  buildComposedView,
  buildSingleWidgetView,
  showToolBinding,
  withToolErrors,
} from "@miragon-ai/widget-shell/server"
import { buildClusterDetailData, buildEngineHealthData } from "../data/health-data.js"
import {
  buildIncidentsDashboardData,
  buildProcessIncidentsData,
} from "../data/incident-panel-data.js"
import { buildIncidentDetailData } from "../data/incident-detail-data.js"
import {
  CAMUNDA7_SHOW_CLUSTER_DETAIL,
  CAMUNDA7_SHOW_ENGINE_HEALTH,
  CAMUNDA7_SHOW_INCIDENT_DETAIL,
  CAMUNDA7_SHOW_INCIDENTS_DASHBOARD,
  CAMUNDA7_SHOW_PROCESS_INCIDENTS,
} from "../tool-names.js"
import { resolveEngine } from "../lib/resolve-engine.js"
import { engineParamShape } from "../lib/with-engine.js"
import { localizeFor } from "../lib/server-locale.js"
import {
  type WidgetToolsContext,
  clusterDetailShape,
  incidentsDashboardFilterShape,
  truncate,
  definitionViewLayout,
} from "./shared.js"

/** Incident triage: dashboard, per-definition views, detail, engine health, clusters. */
export function registerIncidentWidgetTools(ctx: WidgetToolsContext) {
  const { server, registry, healthThresholds, profileStore } = ctx

  server.tool(
    {
      name: CAMUNDA7_SHOW_INCIDENTS_DASHBOARD,
      title: "Incidents Dashboard",
      description:
        "Overview of open incidents across all process definitions: KPIs, filter, per-process group cards with activity summaries. From a card the operator can drill into the per-process detail view.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        ...incidentsDashboardFilterShape,
        ...engineParamShape,
      }),
      ...showToolBinding(CAMUNDA7_SHOW_INCIDENTS_DASHBOARD, "Incidents Dashboard"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
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
        "Open the unified process-definition view focused on its incidents: header, KPI strip, BPMN diagram in incident-overlay mode, and the activity-grouped incident table with per-incident actions (resolve, jump to Cockpit). Same view as camunda7_show_process_detail — this entry point sets the incident focus.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        processDefinitionKey: z.string().describe("Process definition key to drill into"),
        ...engineParamShape,
      }),
      ...showToolBinding(CAMUNDA7_SHOW_PROCESS_INCIDENTS, "Process Incidents"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
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
      return buildComposedView({
        app: "camunda7",
        layout: definitionViewLayout("incidents"),
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
      inputSchema: z.object({
        incidentId: z.string().describe("The incident ID to inspect"),
        ...engineParamShape,
      }),
      ...showToolBinding(CAMUNDA7_SHOW_INCIDENT_DETAIL, "Incident Detail"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
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
      name: CAMUNDA7_SHOW_ENGINE_HEALTH,
      title: "Engine Health Overview",
      description:
        "Show the AI-first engine overview: a deterministic health verdict (ok / degraded / critical) with running-instance and incident KPIs and the top incident clusters, grouped cross-process by failing activity + incident type. The home base for triaging what is wrong on a CIB Seven / Camunda 7 engine — each cluster drills in or hands off to AI for root cause + remediation.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({ ...engineParamShape }),
      ...showToolBinding(CAMUNDA7_SHOW_ENGINE_HEALTH, "Engine Health Overview"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const { client, engineId } = await resolveEngine(args.engine, registry)
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

  server.tool(
    {
      name: CAMUNDA7_SHOW_CLUSTER_DETAIL,
      title: "Failure Cluster Detail",
      description:
        "Drill into ONE failure cluster: the affected process instances (business keys first), the full sample failure message, and the time profile (new in last hour / 24h) for an activity failing with a given incident type. The middle layer between the engine health overview and a single incident's detail.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({ ...clusterDetailShape, ...engineParamShape }),
      ...showToolBinding(CAMUNDA7_SHOW_CLUSTER_DETAIL, "Failure Cluster Detail"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const { client, engineId } = await resolveEngine(args.engine, registry)
      const data = await buildClusterDetailData(client, engineId, {
        activityId: args.activityId,
        incidentType: args.incidentType,
        messageSignature: args.messageSignature,
        businessKeyLike: args.businessKeyLike,
        firstResult: args.firstResult,
        maxResults: args.maxResults,
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
}
