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
import type { CockpitAppData, HistoryTimelineData } from "../view-models.js"
import {
  getHistoricActivityInstances,
  getHistoricActivityInstancesCount,
  getHistoricProcessInstances,
} from "@miragon-ai/camunda7-client/sdk"
import { buildProcessInstancesData, buildProcessListData } from "../data/cockpit-data.js"
import { buildProcessIncidentsData } from "../data/incident-panel-data.js"
import {
  CAMUNDA7_OPEN_COCKPIT,
  CAMUNDA7_SHOW_HISTORY_TIMELINE,
  CAMUNDA7_SHOW_PROCESS_DETAIL,
  CAMUNDA7_SHOW_PROCESS_INSTANCES,
  CAMUNDA7_SHOW_PROCESS_LIST,
} from "../tool-names.js"
import { resolveEngine } from "../lib/resolve-engine.js"
import { engineParamShape } from "../lib/with-engine.js"
import {
  pagingShape,
  processInstancesFilterShape,
  processListFilterShape,
} from "../feed-contracts.js"
import { localizeFor } from "../lib/server-locale.js"
import { type WidgetToolsContext, definitionViewLayout } from "./shared.js"

/** The cockpit entry + the definition/instance list & detail show-tools. */
export function registerCockpitWidgetTools(ctx: WidgetToolsContext) {
  const { server, registry, profileStore } = ctx

  server.tool(
    {
      name: CAMUNDA7_OPEN_COCKPIT,
      title: "Open Cockpit",
      description:
        "Open the consolidated CIB Seven operations cockpit — a single app that navigates client-side (no extra tool calls) across the process landscape: overview, per-definition running instances, instance detail, plus quick access to human tasks, jobs and deployments. The Support entry point.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({ ...engineParamShape }),
      ...showToolBinding(CAMUNDA7_OPEN_COCKPIT, "Open Cockpit"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      // Thin bootstrap: resolve the engine (the caller's saved default or the
      // only engine) and hand the app the engine list — this is what makes the
      // cockpit LAND on the profile's default engine. The app threads the
      // chosen engineId into every nested tool call via the `engine` override,
      // so client-side navigation never depends on the saved default.
      let engineId: string | null = null
      try {
        engineId = (await resolveEngine(args.engine, registry)).engineId
      } catch {
        // Multiple engines, no default saved → the app renders an engine picker.
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
      inputSchema: z.object({
        ...processListFilterShape,
        latestVersion: processListFilterShape.latestVersion.default(true),
        ...pagingShape,
        ...engineParamShape,
      }),
      ...showToolBinding(CAMUNDA7_SHOW_PROCESS_LIST, "Process Definitions"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const { client, engineId } = await resolveEngine(args.engine, registry)
      const data = await buildProcessListData(client, engineId, {
        key: args.key,
        nameLike: args.nameLike,
        latestVersion: args.latestVersion,
        firstResult: args.firstResult,
        maxResults: args.maxResults,
      })
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
      name: CAMUNDA7_SHOW_PROCESS_INSTANCES,
      title: "Process Instances",
      description:
        "List running process instances as a filterable table (business key, version, suspended/incident state). Scope to one definition via processDefinitionKey, or omit it for ALL running instances engine-wide. Drill-in target from the cockpit definitions table and process-detail; each row opens camunda7_show_instance_detail.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        ...processInstancesFilterShape,
        firstResult: pagingShape.firstResult,
        maxResults: pagingShape.maxResults.default(50),
        ...engineParamShape,
      }),
      ...showToolBinding(CAMUNDA7_SHOW_PROCESS_INSTANCES, "Process Instances"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const { client, engineId } = await resolveEngine(args.engine, registry)
      const data = await buildProcessInstancesData(client, engineId, {
        processDefinitionKey: args.processDefinitionKey,
        active: args.active,
        suspended: args.suspended,
        withIncidentsOnly: args.withIncidentsOnly,
        businessKeyLike: args.businessKeyLike,
        firstResult: args.firstResult,
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
          processDefinitionKey: data.processDefinitionKey ?? "(all definitions)",
          withIncidentCount: data.withIncidentCount,
          suspendedCount: data.suspendedCount,
          returnedCount: data.returnedCount,
        }),
      })
    }),
  )

  server.tool(
    {
      name: CAMUNDA7_SHOW_PROCESS_DETAIL,
      title: "Process Definition Detail",
      description:
        "Open the unified process-definition view: header with actions, KPI strip (running instances, incidents, failed jobs), BPMN flow (incident overlays or execution heatmap) and the activity-grouped incident list. Drill-in target from cockpit-dashboard rows; camunda7_show_process_incidents opens the same view with incident focus.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        processDefinitionKey: z.string().describe("Process definition key to display"),
        ...engineParamShape,
      }),
      ...showToolBinding(CAMUNDA7_SHOW_PROCESS_DETAIL, "Process Definition Detail"),
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
        layout: definitionViewLayout(),
        entries: [{ dataType: "camunda7:processIncidents", data: { ...data, engineId } }],
        summary: t("c7sum.processDetail", {
          processDefinitionKey: data.processDefinitionKey,
          version: data.version != null ? ` v${data.version}` : "",
          // null = statistics unavailable — never report it as a confident 0.
          runningInstances: data.runningInstances ?? "unknown",
          openIncidents: data.incidentCount,
          failedJobs: data.failedJobs ?? "unknown",
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
      inputSchema: z.object({
        processInstanceId: z.string().describe("The process instance ID"),
        firstResult: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Offset for pagination (0-based)."),
        maxResults: z.number().int().positive().optional().describe("Page size (default 500)."),
        ...engineParamShape,
      }),
      ...showToolBinding(CAMUNDA7_SHOW_HISTORY_TIMELINE, "History Timeline"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const { client, engineId } = await resolveEngine(args.engine, registry)
      const [activities, activitiesCount, instances] = await Promise.all([
        getHistoricActivityInstances({
          client,
          query: {
            processInstanceId: args.processInstanceId,
            sortBy: "startTime",
            sortOrder: "asc",
            firstResult: args.firstResult,
            maxResults: args.maxResults ?? 500,
          },
        }),
        // Honest total via /count — the page above is capped, so its length
        // would silently understate long-running instances.
        getHistoricActivityInstancesCount({
          client,
          query: { processInstanceId: args.processInstanceId },
        }).catch(() => null),
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
        totalActivities: activitiesCount?.count ?? actArray.length,
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
}
