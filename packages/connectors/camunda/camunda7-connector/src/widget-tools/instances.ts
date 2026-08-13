import { z } from "zod"
// Feed payloads built as named interface types are spread at the call sites
// (`rawData({ ...data })`): the feed contract takes `Record<string, unknown>`,
// which interface types don't structurally satisfy.
import {
  buildComposedView,
  buildSingleWidgetView,
  withToolErrors,
} from "@miragon-ai/widget-shell/server"
import { buildInstanceDetailData, buildJobPanelData } from "../data/cockpit-data.js"
import { buildBpmnViewerData } from "../data/bpmn-viewer-data.js"
import {
  CAMUNDA7_SHOW_BPMN_VIEWER,
  CAMUNDA7_SHOW_INSTANCE_DETAIL,
  CAMUNDA7_SHOW_JOB_PANEL,
} from "../tool-names.js"
import { resolveEngine } from "../lib/resolve-engine.js"
import { engineParamShape } from "../lib/with-engine.js"
import { jobsFilterShape, pagingShape } from "../feed-contracts.js"
import { localizeFor } from "../lib/server-locale.js"
import { type WidgetToolsContext, showToolBinding } from "./shared.js"

/** Single-instance drill-downs: instance detail, BPMN viewer, job panel. */
export function registerInstanceWidgetTools(ctx: WidgetToolsContext) {
  const { server, registry, profileStore } = ctx

  server.tool(
    {
      name: CAMUNDA7_SHOW_INSTANCE_DETAIL,
      title: "Process Instance Detail",
      description:
        "Show detailed view of a single process instance with activity tree, variables, and incidents.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        processInstanceId: z.string().describe("The process instance ID to inspect"),
        ...engineParamShape,
      }),
      ...showToolBinding(CAMUNDA7_SHOW_INSTANCE_DETAIL, "Process Instance Detail"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const { client, engineId, baseUrl, cockpitUrl, provider } = resolveEngine(
        args.engine,
        registry,
      )
      const data = await buildInstanceDetailData(
        client,
        engineId,
        { processInstanceId: args.processInstanceId },
        { baseUrl, cockpitUrl, provider },
      )
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
      name: CAMUNDA7_SHOW_BPMN_VIEWER,
      title: "BPMN Diagram Viewer",
      description:
        "Show an interactive BPMN diagram. Pass `processInstanceId` to overlay active activities, incidents, and failed-job counts for a running instance, or pass `processDefinitionKey` (with optional `version`) to view the diagram of a process definition without instance overlays.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      inputSchema: z
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
      ...showToolBinding(CAMUNDA7_SHOW_BPMN_VIEWER, "BPMN Diagram Viewer"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
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
      inputSchema: z.object({
        ...jobsFilterShape,
        failedOnly: jobsFilterShape.failedOnly.default(false),
        ...pagingShape,
        ...engineParamShape,
      }),
      ...showToolBinding(CAMUNDA7_SHOW_JOB_PANEL, "Job Management Panel"),
    },
    withToolErrors(async (args, ctx) => {
      const t = await localizeFor(profileStore, ctx)
      const { client, engineId } = resolveEngine(args.engine, registry)
      const data = await buildJobPanelData(client, engineId, {
        processDefinitionKey: args.processDefinitionKey,
        failedOnly: args.failedOnly,
        firstResult: args.firstResult,
        maxResults: args.maxResults,
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
}
