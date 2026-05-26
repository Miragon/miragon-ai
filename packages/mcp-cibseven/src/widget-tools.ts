import { z } from "zod"
import type { MCPServer } from "mcp-use/server"
import { buildComposedView, buildSingleWidgetView } from "@miragon-ai/widget-shell/server"
import type {
  ProcessListData,
  TaskDashboardData,
  TaskData,
  InstanceDetailData,
  HistoryTimelineData,
} from "@miragon-ai/client-cibseven"
import {
  getProcessDefinitions,
  getProcessInstance,
  getActivityInstanceTree,
  getProcessInstanceVariables,
  getIncidents,
  getTasks,
  getHistoricActivityInstances,
  getHistoricProcessInstances,
  getProcessDefinitionBpmn20Xml,
  getProcessDefinitionStatistics,
  getActivityStatistics,
  getDeployments,
  getDeploymentResources,
  getJobs,
} from "@miragon-ai/client-cibseven/generated/sdk.gen"
import { buildIncidentsDashboardData, buildProcessIncidentsData } from "./incident-panel-data.js"
import { buildProcessDetailData } from "./steps/process-detail.js"
import { buildIncidentDetailData } from "./steps/incident-detail.js"
import { buildTaskFormSchema } from "./tools/task-form.js"
import { collectActiveActivityIds, collectIncidentActivityIds } from "./lib/activity-tree.js"
import {
  CAMUNDA7_SHOW_INCIDENT_DETAIL,
  CAMUNDA7_SHOW_PROCESS_DETAIL,
  CAMUNDA7_SHOW_PROCESS_INCIDENTS,
} from "./tool-names.js"
import { resolveEngine, type EngineRegistry } from "./lib/resolve-engine.js"

const engineParam = {
  engine: z
    .string()
    .optional()
    .describe(
      "Optional engine id override for this single call. When omitted, the engine selected via `camunda7_select_engine` for this session is used.",
    ),
}

export function registerWidgetTools(
  server: MCPServer,
  registry: EngineRegistry,
  resourceUri: string,
) {
  const uiMeta = { ui: { resourceUri } }

  server.tool(
    {
      name: "camunda7_show_process_list",
      title: "Process Definitions",
      description: "Show deployed process definitions as a card grid view.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        key: z.string().optional(),
        nameLike: z.string().optional(),
        latestVersion: z.boolean().optional().default(true),
        ...engineParam,
      }),
      _meta: uiMeta,
    },
    async (args) => {
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
      return buildSingleWidgetView({
        widget: "camunda7:process-list",
        app: "camunda7",
        dataType: "camunda7:processDefinitionList",
        data,
        title: "Process Definitions",
      })
    },
  )

  server.tool(
    {
      name: "camunda7_show_task_dashboard",
      title: "Task Dashboard",
      description: "Show open user tasks as a dashboard with filters.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        assignee: z.string().optional(),
        candidateGroup: z.string().optional(),
        processDefinitionKey: z.string().optional(),
        maxResults: z.number().optional().default(50),
        ...engineParam,
      }),
      _meta: uiMeta,
    },
    async (args) => {
      const { client, engineId } = resolveEngine(args.engine, registry)
      const tasks = await getTasks({
        client,
        query: {
          assignee: args.assignee,
          candidateGroup: args.candidateGroup,
          processDefinitionKey: args.processDefinitionKey,
          maxResults: args.maxResults,
          sortBy: "created",
          sortOrder: "desc",
        },
      })
      const taskArray = Array.isArray(tasks) ? tasks : []
      const data: TaskDashboardData = {
        tasks: taskArray as TaskDashboardData["tasks"],
        totalCount: taskArray.length,
        filters: {
          assignee: args.assignee,
          candidateGroup: args.candidateGroup,
          processDefinitionKey: args.processDefinitionKey,
        },
        engineId,
      }
      return buildComposedView({
        app: "camunda7",
        title: "Task Dashboard",
        layout: [{ row: [{ widget: "camunda7:task-list-table" }] }],
        entries: [{ dataType: "camunda7:taskList", data }],
      })
    },
  )

  server.tool(
    {
      name: "camunda7_show_instance_detail",
      title: "Process Instance Detail",
      description:
        "Show detailed view of a single process instance with activity tree, variables, and incidents.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processInstanceId: z.string().describe("The process instance ID to inspect"),
        ...engineParam,
      }),
      _meta: uiMeta,
    },
    async (args) => {
      const { client, engineId } = resolveEngine(args.engine, registry)
      const [instance, activityTree, variables, incidents, openTasksRaw] = await Promise.all([
        getProcessInstance({ client, path: { id: args.processInstanceId } }),
        getActivityInstanceTree({ client, path: { id: args.processInstanceId } }).catch(() => null),
        getProcessInstanceVariables({
          client,
          path: { id: args.processInstanceId },
        }).catch(() => ({})),
        getIncidents({
          client,
          query: { processInstanceId: args.processInstanceId, maxResults: 100 },
        }).catch(() => []),
        getTasks({
          client,
          query: {
            processInstanceId: args.processInstanceId,
            maxResults: 50,
            sortBy: "created",
            sortOrder: "asc",
          },
        }).catch(() => []),
      ])

      let bpmnXml: string | null = null
      const definitionId = (instance as { definitionId?: string } | null)?.definitionId
      if (definitionId) {
        try {
          const xmlResponse = await getProcessDefinitionBpmn20Xml({
            client,
            path: { id: definitionId },
          })
          bpmnXml = (xmlResponse as { bpmn20Xml?: string } | null)?.bpmn20Xml ?? null
        } catch {
          bpmnXml = null
        }
      }

      const taskList = (Array.isArray(openTasksRaw) ? openTasksRaw : []) as TaskData[]
      const openTasks: InstanceDetailData["openTasks"] = await Promise.all(
        taskList.map(async (task) => ({
          ...task,
          formSchema: await buildTaskFormSchema(client, task.id, {
            task: {
              taskDefinitionKey: task.taskDefinitionKey,
              processDefinitionId: task.processDefinitionId,
            },
            bpmnXml,
          }).catch(() => ({
            taskId: task.id,
            fields: [],
          })),
        })),
      )

      const data: InstanceDetailData = {
        instance: instance as unknown as InstanceDetailData["instance"],
        activityTree: activityTree as unknown as InstanceDetailData["activityTree"],
        variables: variables as unknown as InstanceDetailData["variables"],
        incidents: incidents as unknown as InstanceDetailData["incidents"],
        bpmnXml,
        activeActivityIds: collectActiveActivityIds(activityTree),
        incidentActivityIds: collectIncidentActivityIds(incidents),
        openTasks,
        engineId,
      }
      return buildSingleWidgetView({
        widget: "camunda7:instance-detail",
        app: "camunda7",
        dataType: "camunda7:processInstance",
        data,
        title: "Process Instance",
      })
    },
  )

  server.tool(
    {
      name: "camunda7_show_incidents_dashboard",
      title: "Incidents Dashboard",
      description:
        "Overview of open incidents across all process definitions: KPIs, filter, per-process group cards with activity summaries. From a card the operator can drill into the per-process detail view.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processDefinitionKey: z.string().optional(),
        incidentType: z.string().optional(),
        ...engineParam,
      }),
      _meta: uiMeta,
    },
    async (args) => {
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
      })
    },
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
        ...engineParam,
      }),
      _meta: uiMeta,
    },
    async (args) => {
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
      })
    },
  )

  server.tool(
    {
      name: CAMUNDA7_SHOW_INCIDENT_DETAIL,
      title: "Incident Detail",
      description:
        "Detail view for a single incident: failure stacktrace, BPMN with the failing activity highlighted, instance variables and activity tree, and a history timeline. Drill-in target from camunda7_show_process_incidents.",
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
      schema: z.object({
        incidentId: z.string().describe("The incident ID to inspect"),
        ...engineParam,
      }),
      _meta: uiMeta,
    },
    async (args) => {
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
      })
    },
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
        ...engineParam,
      }),
      _meta: uiMeta,
    },
    async (args) => {
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
      })
    },
  )

  server.tool(
    {
      name: "camunda7_show_history_timeline",
      title: "History Timeline",
      description: "Show activity timeline for a process instance.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processInstanceId: z.string().describe("The process instance ID"),
        ...engineParam,
      }),
      _meta: uiMeta,
    },
    async (args) => {
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
      })
    },
  )

  server.tool(
    {
      name: "camunda7_show_cockpit_dashboard",
      title: "Cockpit Dashboard",
      description:
        "Show the Cockpit dashboard with process definition statistics: running instances, failed jobs, and incidents per definition.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({ ...engineParam }),
      _meta: uiMeta,
    },
    async (args) => {
      const { client, engineId } = resolveEngine(args.engine, registry)
      let rows: Array<{
        id?: string | null
        instances?: number
        failedJobs?: number
        incidents?: Array<{ incidentType?: string | null; incidentCount?: number | null }> | null
        definition?: {
          id?: string | null
          key?: string | null
          name?: string | null
          version?: number | null
        }
      }> = []

      try {
        const stats = await getProcessDefinitionStatistics({
          client,
          query: { failedJobs: true, incidents: true },
        })
        rows = Array.isArray(stats) ? (stats as typeof rows) : []
      } catch {
        const [defs, incidents] = await Promise.all([
          getProcessDefinitions({
            client,
            query: { latestVersion: true, maxResults: 100, sortBy: "name", sortOrder: "asc" },
          }),
          getIncidents({ client, query: { maxResults: 500 } }).catch(() => []),
        ])
        const defArray = Array.isArray(defs) ? defs : []
        const incArray = Array.isArray(incidents) ? incidents : []

        const incByDef = new Map<string, number>()
        for (const inc of incArray as Array<{ processDefinitionId?: string }>) {
          const k = inc.processDefinitionId ?? ""
          incByDef.set(k, (incByDef.get(k) ?? 0) + 1)
        }

        rows = (
          defArray as Array<{
            id?: string | null
            key?: string | null
            name?: string | null
            version?: number | null
          }>
        ).map((d) => ({
          id: d.id,
          instances: 0,
          failedJobs: 0,
          incidents: incByDef.has(d.id ?? "")
            ? [{ incidentType: "failedJob", incidentCount: incByDef.get(d.id ?? "") ?? 0 }]
            : [],
          definition: d,
        }))
      }

      let totalRunning = 0
      let totalFailed = 0
      let totalIncidents = 0

      const definitions = rows.map((row) => {
        const incidents = (row.incidents ?? []).map((i) => ({
          incidentType: i.incidentType ?? "unknown",
          incidentCount: i.incidentCount ?? 0,
        }))
        const incidentSum = incidents.reduce((s, i) => s + i.incidentCount, 0)
        totalRunning += row.instances ?? 0
        totalFailed += row.failedJobs ?? 0
        totalIncidents += incidentSum
        return {
          id: row.definition?.id ?? row.id ?? "",
          key: row.definition?.key ?? "",
          name: row.definition?.name ?? null,
          version: row.definition?.version ?? 0,
          instances: row.instances ?? 0,
          failedJobs: row.failedJobs ?? 0,
          incidents,
        }
      })

      definitions.sort((a, b) => {
        const aIssues = a.failedJobs + a.incidents.reduce((s, i) => s + i.incidentCount, 0)
        const bIssues = b.failedJobs + b.incidents.reduce((s, i) => s + i.incidentCount, 0)
        if (aIssues !== bIssues) return bIssues - aIssues
        return b.instances - a.instances
      })

      return buildComposedView({
        app: "camunda7",
        title: "Cockpit Dashboard",
        layout: [
          { row: [{ widget: "camunda7:process-health-kpi" }] },
          { row: [{ widget: "camunda7:process-definitions-table" }] },
        ],
        entries: [
          {
            dataType: "camunda7:cockpitDashboard",
            data: {
              summary: {
                totalDefinitions: definitions.length,
                totalRunningInstances: totalRunning,
                totalFailedJobs: totalFailed,
                totalIncidents,
              },
              definitions,
              engineId,
            },
          },
        ],
      })
    },
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
          ...engineParam,
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
    async (args) => {
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
      })
    },
  )

  server.tool(
    {
      name: "camunda7_show_deployment_browser",
      title: "Deployment Browser",
      description: "Show deployed resources grouped by deployment with metadata.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        name: z.string().optional().describe("Filter by deployment name"),
        maxResults: z.number().optional().default(20),
        ...engineParam,
      }),
      _meta: uiMeta,
    },
    async (args) => {
      const { client, engineId } = resolveEngine(args.engine, registry)
      const deps = (await getDeployments({
        client,
        query: {
          name: args.name,
          maxResults: args.maxResults,
          sortBy: "deploymentTime",
          sortOrder: "desc",
        },
      })) as unknown as Array<{
        id: string
        name?: string | null
        deploymentTime?: string
        source?: string | null
        tenantId?: string | null
      }>

      const rows = Array.isArray(deps) ? deps : []

      const withResources = await Promise.all(
        rows.slice(0, 20).map(async (dep) => {
          let resources: Array<{ id: string; name: string }> = []
          try {
            const res = (await getDeploymentResources({
              client,
              path: { id: dep.id },
            })) as unknown as Array<{ id: string; name: string }>
            resources = Array.isArray(res) ? res.map((r) => ({ id: r.id, name: r.name })) : []
          } catch {
            /* resources unavailable */
          }
          return {
            id: dep.id,
            name: dep.name ?? null,
            deploymentTime: dep.deploymentTime ?? "",
            source: dep.source ?? null,
            tenantId: dep.tenantId ?? null,
            resources,
          }
        }),
      )

      return buildSingleWidgetView({
        widget: "camunda7:deployment-browser",
        app: "camunda7",
        dataType: "camunda7:deploymentBrowser",
        title: "Deployment Browser",
        data: { totalCount: rows.length, deployments: withResources, engineId },
      })
    },
  )

  server.tool(
    {
      name: "camunda7_show_job_panel",
      title: "Job Management Panel",
      description:
        "Show jobs with a focus on failed jobs (no retries left). Displays error messages and retry status.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
        failedOnly: z.boolean().optional().default(false).describe("Show only failed jobs"),
        ...engineParam,
      }),
      _meta: uiMeta,
    },
    async (args) => {
      const { client, engineId } = resolveEngine(args.engine, registry)
      const [failedJobs, allJobs] = await Promise.all([
        getJobs({
          client,
          query: {
            processDefinitionKey: args.processDefinitionKey,
            noRetriesLeft: true,
            maxResults: 100,
            sortBy: "jobId",
            sortOrder: "desc",
          },
        }).catch(() => []),
        args.failedOnly
          ? Promise.resolve([])
          : getJobs({
              client,
              query: {
                processDefinitionKey: args.processDefinitionKey,
                maxResults: 100,
                sortBy: "jobId",
                sortOrder: "desc",
              },
            }).catch(() => []),
      ])

      const failed = Array.isArray(failedJobs)
        ? (failedJobs as Array<{
            id: string
            processInstanceId: string
            processDefinitionKey?: string | null
            processDefinitionId?: string | null
            activityId?: string | null
            retries: number
            exceptionMessage?: string | null
            dueDate?: string | null
            suspended: boolean
            priority: number
            createTime?: string | null
          }>)
        : []
      const all = args.failedOnly
        ? failed
        : Array.isArray(allJobs)
          ? (allJobs as typeof failed)
          : []

      const jobs = (args.failedOnly ? failed : all).map((j) => ({
        id: j.id,
        processInstanceId: j.processInstanceId,
        processDefinitionKey: j.processDefinitionKey ?? null,
        processDefinitionId: j.processDefinitionId ?? null,
        activityId: j.activityId ?? null,
        retries: j.retries,
        exceptionMessage: j.exceptionMessage ?? null,
        dueDate: j.dueDate ?? null,
        suspended: j.suspended,
        priority: j.priority,
        createTime: j.createTime ?? null,
      }))

      return buildSingleWidgetView({
        widget: "camunda7:job-panel",
        app: "camunda7",
        dataType: "camunda7:jobPanel",
        title: "Job Panel",
        data: {
          totalCount: args.failedOnly ? failed.length : all.length,
          failedCount: failed.length,
          jobs,
          engineId,
        },
      })
    },
  )
}
