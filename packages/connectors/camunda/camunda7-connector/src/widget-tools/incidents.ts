import { z } from "zod"
// Feed payloads built as named interface types are spread at the call sites
// (`rawData({ ...data })`): the feed contract takes `Record<string, unknown>`,
// which interface types don't structurally satisfy.
import {
  buildComposedView,
  buildSingleWidgetView,
  showToolBinding,
  withToolErrors,
  strictToolInput,
} from "@miragon-ai/widget-shell/server"
import { buildClusterDetailData } from "../data/cluster-detail-data.js"
import { buildEngineHealthData, healthVerdictRule } from "../data/health-data.js"
import { buildIncidentsDashboardData } from "../data/incidents-dashboard-data.js"
import { buildProcessIncidentsData } from "../data/process-incidents-data.js"
import { buildIncidentDetailData } from "../data/incident-detail-data.js"
import {
  CAMUNDA7_SHOW_CLUSTER_DETAIL,
  CAMUNDA7_SHOW_ENGINE_HEALTH,
  CAMUNDA7_SHOW_INCIDENT_DETAIL,
  CAMUNDA7_SHOW_INCIDENTS_DASHBOARD,
  CAMUNDA7_SHOW_PROCESS_INCIDENTS,
} from "../tool-names.js"
import { resolveEngine } from "../lib/resolve-engine.js"
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
  const { server, registry, healthThresholds, profileStore, engineParam } = ctx

  server.tool(
    {
      name: CAMUNDA7_SHOW_INCIDENTS_DASHBOARD,
      title: "Incidents Dashboard",
      description:
        "Overview of open incidents across all process definitions: KPIs, filter, per-process group cards with activity summaries. From a card the operator can drill into the per-process detail view. Use for open incidents by process; for an engine verdict with cross-process clusters use camunda7_show_engine_health.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: strictToolInput({
        ...incidentsDashboardFilterShape,
        ...engineParam,
      }),
      ...showToolBinding(CAMUNDA7_SHOW_INCIDENTS_DASHBOARD, "Incidents Dashboard"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
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
      inputSchema: strictToolInput({
        processDefinitionKey: z.string().describe("Process definition key to drill into"),
        ...engineParam,
      }),
      ...showToolBinding(CAMUNDA7_SHOW_PROCESS_INCIDENTS, "Process Incidents"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
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
      return buildComposedView({
        app: "camunda7",
        layout: definitionViewLayout("incidents"),
        entries: [{ dataType: "camunda7:processIncidents", data: { ...data, engineId } }],
        summary: t("c7sum.processIncidents", {
          processDefinitionKey: data.processDefinitionKey,
          diagramVersion: data.diagramVersion,
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
      inputSchema: strictToolInput({
        incidentId: z.string().describe("The incident ID to inspect"),
        ...engineParam,
      }),
      ...showToolBinding(CAMUNDA7_SHOW_INCIDENT_DETAIL, "Incident Detail"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
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
        "Show ONE engine's health overview: a deterministic verdict (ok / degraded / critical) with running-instance and incident KPIs and the top incident clusters, grouped cross-process by failing activity + incident type; each cluster drills in or hands off to AI. " +
        `Verdict: ${healthVerdictRule(healthThresholds)} ` +
        "Use for what is failing on an engine right now; for metric trends, job backlog or firing alerts use analytics_engine_health.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: strictToolInput({ ...engineParam }),
      ...showToolBinding(CAMUNDA7_SHOW_ENGINE_HEALTH, "Engine Health Overview"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const { client, engineId } = await resolveEngine(args.engine, registry, ctx)
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
          rule: data.statusRule,
          totalIncidents: data.summary.totalIncidents,
          // null = the capped scan cannot vouch for it — never a guessed count.
          affectedActivities: data.summary.affectedActivities ?? t("c7sum.unknownNumberOf"),
          runningInstances: data.summary.runningInstances,
          topCluster: top
            ? t("c7sum.engineHealth.topCluster", {
                activityId: top.activityId,
                incidentType: top.incidentType,
                // null = the capped scan holds only part of it — a lower bound, said as one.
                incidentCount:
                  top.incidentCount ?? t("c7sum.atLeast", { count: top.scannedIncidentCount }),
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
      inputSchema: strictToolInput({ ...clusterDetailShape, ...engineParam }),
      ...showToolBinding(CAMUNDA7_SHOW_CLUSTER_DETAIL, "Failure Cluster Detail"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const { client, engineId } = await resolveEngine(args.engine, registry, ctx)
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
          incidentCount:
            data.incidentCount ?? t("c7sum.atLeast", { count: data.scannedIncidentCount }),
          lastHourCount: data.lastHourCount ?? t("c7sum.unknown"),
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
