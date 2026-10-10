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
import type { CockpitAppData, CockpitEngineInfo } from "../view-models.js"
import { MAX_PAGE_SIZE } from "@miragon-ai/camunda7-client/schemas"
import { buildProcessInstancesData, buildProcessListData } from "../data/cockpit-data.js"
import { buildHistoryTimelineData } from "../data/history-timeline-data.js"
import { buildProcessIncidentsData } from "../data/process-incidents-data.js"
import {
  CAMUNDA7_OPEN_COCKPIT,
  CAMUNDA7_SHOW_HISTORY_TIMELINE,
  CAMUNDA7_SHOW_PROCESS_DETAIL,
  CAMUNDA7_SHOW_PROCESS_INSTANCES,
  CAMUNDA7_SHOW_PROCESS_LIST,
} from "../tool-names.js"
import { resolveEngine } from "../lib/resolve-engine.js"
import { cockpitEngineScope } from "../lib/engine-preferences.js"
import { environmentOf } from "../lib/environments.js"
import {
  pagingShape,
  processInstancesFilterShape,
  processListFilterShape,
} from "../feed-contracts.js"
import { localizeFor } from "../lib/server-locale.js"
import { type WidgetToolsContext, definitionViewLayout } from "./shared.js"

/** The cockpit entry + the definition/instance list & detail show-tools. */
export function registerCockpitWidgetTools(ctx: WidgetToolsContext) {
  const { server, registry, profileStore, engineParam } = ctx

  server.tool(
    {
      name: CAMUNDA7_OPEN_COCKPIT,
      title: "Open Cockpit",
      description:
        "Open the consolidated CIB Seven operations cockpit — a single app that navigates client-side (no extra tool calls) across the process landscape: overview, per-definition running instances, instance detail, plus quick access to human tasks, jobs and deployments. Use to browse and act; for a health verdict use camunda7_show_engine_health.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: strictToolInput({ ...engineParam }),
      ...showToolBinding(CAMUNDA7_OPEN_COCKPIT, "Open Cockpit"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      // Thin bootstrap: the engine the cockpit OPENS on (per-call `engine` >
      // the caller's saved default > the only engine in their list; null →
      // the picker) over the caller's engine list — the app seeds its scope
      // from it. A bad `engine` is a tool error, never a silent picker. The
      // app threads the chosen engineId into every nested tool call via the
      // `engine` override, so client-side navigation never depends on the
      // saved default.
      const { engines, engineId } = await cockpitEngineScope(
        profileStore,
        registry,
        args.engine,
        ctx,
      )
      const data: CockpitAppData = {
        engineId,
        // No REST baseUrl: the app navigates by engine id (internal topology stays server-side).
        // The explicit return type makes an extra field an excess-property error —
        // a contextually typed map callback would accept it silently.
        engines: engines.map((e): CockpitEngineInfo => ({
          id: e.id,
          environment: environmentOf(e),
        })),
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
      inputSchema: strictToolInput({
        ...processListFilterShape,
        latestVersion: processListFilterShape.latestVersion.default(true),
        ...pagingShape,
        ...engineParam,
      }),
      ...showToolBinding(CAMUNDA7_SHOW_PROCESS_LIST, "Process Definitions"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const { client, engineId } = await resolveEngine(args.engine, registry, ctx)
      const data = await buildProcessListData(client, engineId, {
        processDefinitionKey: args.processDefinitionKey,
        nameLike: args.nameLike,
        latestVersion: args.latestVersion,
        firstResult: args.firstResult,
        maxResults: args.maxResults,
      })
      const filters = [
        args.processDefinitionKey && `key "${args.processDefinitionKey}"`,
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
      inputSchema: strictToolInput({
        ...processInstancesFilterShape,
        firstResult: pagingShape.firstResult,
        maxResults: pagingShape.maxResults.default(50),
        ...engineParam,
      }),
      ...showToolBinding(CAMUNDA7_SHOW_PROCESS_INSTANCES, "Process Instances"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const { client, engineId } = await resolveEngine(args.engine, registry, ctx)
      const data = await buildProcessInstancesData(client, engineId, {
        processDefinitionKey: args.processDefinitionKey,
        active: args.active,
        suspended: args.suspended,
        withIncidents: args.withIncidents,
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
      inputSchema: strictToolInput({
        processDefinitionKey: z.string().describe("Process definition key to display"),
        ...engineParam,
      }),
      ...showToolBinding(CAMUNDA7_SHOW_PROCESS_DETAIL, "Process Definition Detail"),
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
        layout: definitionViewLayout(),
        entries: [{ dataType: "camunda7:processIncidents", data: { ...data, engineId } }],
        summary: t("c7sum.processDetail", {
          processDefinitionKey: data.processDefinitionKey,
          diagramVersion: data.diagramVersion,
          runningInstances: data.runningInstances,
          openIncidents: data.incidentCount,
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
      inputSchema: strictToolInput({
        processInstanceId: z.string().describe("The process instance ID"),
        firstResult: pagingShape.firstResult,
        // One capped page like every list; the widget pages the rest.
        maxResults: pagingShape.maxResults.default(MAX_PAGE_SIZE),
        ...engineParam,
      }),
      ...showToolBinding(CAMUNDA7_SHOW_HISTORY_TIMELINE, "History Timeline"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const { client, engineId } = await resolveEngine(args.engine, registry, ctx)
      // Shared builder with the `camunda7:load-history-timeline` step.
      const data = await buildHistoryTimelineData(client, engineId, {
        processInstanceId: args.processInstanceId,
        firstResult: args.firstResult,
        maxResults: args.maxResults,
      })
      return buildSingleWidgetView({
        widget: "camunda7:history-timeline",
        app: "camunda7",
        dataType: "camunda7:historyTimeline",
        data,
        title: "History Timeline",
        summary: t("c7sum.historyTimeline", {
          processInstanceId: args.processInstanceId,
          totalActivities: data.totalActivities,
          notFound: data.processInstance ? "" : t("c7sum.historyTimeline.notFound"),
        }),
      })
    }),
  )
}
