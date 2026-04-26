import { z } from "zod"
import type { MCPServer } from "mcp-use/server"
import { buildSingleWidgetView } from "@miragon-ai/widget-shell/server"
import type {
  Client,
  ProcessListData,
  TaskDashboardData,
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

export interface WidgetToolsConfig {
  baseUrl: string
  cockpitUrl?: string
}

export function registerWidgetTools(
  server: MCPServer,
  client: Client,
  resourceUri: string,
  widgetConfig: WidgetToolsConfig,
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
      }),
      _meta: uiMeta,
    },
    async (args) => {
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
      }),
      _meta: uiMeta,
    },
    async (args) => {
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
      }
      return buildSingleWidgetView({
        widget: "camunda7:task-dashboard",
        app: "camunda7",
        dataType: "camunda7:taskList",
        data,
        title: "Task Dashboard",
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
      }),
      _meta: uiMeta,
    },
    async (args) => {
      const [instance, activityTree, variables, incidents] = await Promise.all([
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

      const data: InstanceDetailData = {
        instance: instance as unknown as InstanceDetailData["instance"],
        activityTree: activityTree as unknown as InstanceDetailData["activityTree"],
        variables: variables as unknown as InstanceDetailData["variables"],
        incidents: incidents as unknown as InstanceDetailData["incidents"],
        bpmnXml,
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
      }),
      _meta: uiMeta,
    },
    async (args) => {
      const data = await buildIncidentsDashboardData(client, {
        baseUrl: widgetConfig.baseUrl,
        cockpitUrl: widgetConfig.cockpitUrl,
        processDefinitionKey: args.processDefinitionKey,
        incidentType: args.incidentType,
      })
      return buildSingleWidgetView({
        widget: "camunda7:incidents-dashboard",
        app: "camunda7",
        dataType: "camunda7:incidentsDashboard",
        data,
      })
    },
  )

  server.tool(
    {
      name: "camunda7_show_process_incidents",
      title: "Process Incidents",
      description:
        "Per-process incident detail: header, KPIs, BPMN diagram with incident overlays, and activity-grouped incident table with per-incident actions (resolve, jump to Cockpit).",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processDefinitionKey: z.string().describe("Process definition key to drill into"),
      }),
      _meta: uiMeta,
    },
    async (args) => {
      const data = await buildProcessIncidentsData(client, {
        baseUrl: widgetConfig.baseUrl,
        cockpitUrl: widgetConfig.cockpitUrl,
        processDefinitionKey: args.processDefinitionKey,
      })
      return buildSingleWidgetView({
        widget: "camunda7:process-incidents",
        app: "camunda7",
        dataType: "camunda7:processIncidents",
        data,
      })
    },
  )

  server.tool(
    {
      name: "camunda7_show_process_detail",
      title: "Process Definition Detail",
      description:
        "Detail view for a single process definition: tinted header, MiniStats KPIs, BPMN flow with incident overlays. Drill-in target from cockpit-dashboard rows; can hand off to camunda7_show_process_incidents for the per-incident table.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processDefinitionKey: z.string().describe("Process definition key to display"),
      }),
      _meta: uiMeta,
    },
    async (args) => {
      const data = await buildProcessDetailData(client, {
        baseUrl: widgetConfig.baseUrl,
        cockpitUrl: widgetConfig.cockpitUrl,
        processDefinitionKey: args.processDefinitionKey,
      })
      return buildSingleWidgetView({
        widget: "camunda7:process-detail",
        app: "camunda7",
        dataType: "camunda7:processDetail",
        data,
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
      }),
      _meta: uiMeta,
    },
    async (args) => {
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

  // --- Cockpit Dashboard ---
  server.tool(
    {
      name: "camunda7_show_cockpit_dashboard",
      title: "Cockpit Dashboard",
      description:
        "Show the Cockpit dashboard with process definition statistics: running instances, failed jobs, and incidents per definition.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({}),
      _meta: uiMeta,
    },
    async () => {
      // Try statistics endpoint first, fall back to plain definition list
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
        // Statistics endpoint unavailable — build rows from plain definitions + incidents
        const [defs, incidents] = await Promise.all([
          getProcessDefinitions({
            client,
            query: { latestVersion: true, maxResults: 100, sortBy: "name", sortOrder: "asc" },
          }),
          getIncidents({ client, query: { maxResults: 500 } }).catch(() => []),
        ])
        const defArray = Array.isArray(defs) ? defs : []
        const incArray = Array.isArray(incidents) ? incidents : []

        // Count incidents per definition
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

      return buildSingleWidgetView({
        widget: "camunda7:cockpit-dashboard",
        app: "camunda7",
        dataType: "camunda7:cockpitDashboard",
        title: "Cockpit Dashboard",
        data: {
          summary: {
            totalDefinitions: definitions.length,
            totalRunningInstances: totalRunning,
            totalFailedJobs: totalFailed,
            totalIncidents,
          },
          definitions,
        },
      })
    },
  )

  // --- BPMN Viewer ---
  server.tool(
    {
      name: "camunda7_show_bpmn_viewer",
      title: "BPMN Diagram Viewer",
      description:
        "Show an interactive BPMN diagram for a process instance with active activity highlights, incident markers, and instance count overlays.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processInstanceId: z.string().describe("The process instance ID to visualize"),
      }),
      _meta: uiMeta,
    },
    async (args) => {
      const instance = (await getProcessInstance({
        client,
        path: { id: args.processInstanceId },
      })) as { definitionId?: string } | null

      const definitionId = instance?.definitionId
      if (!definitionId) {
        return buildSingleWidgetView({
          widget: "camunda7:bpmn-viewer",
          app: "camunda7",
          dataType: "camunda7:bpmnViewer",
          title: "BPMN Viewer",
          data: {
            bpmnXml: "",
            processInstanceId: args.processInstanceId,
            processDefinitionId: null,
            activeActivityIds: [],
            incidentActivityIds: [],
            activityStats: [],
          },
        })
      }

      const [xmlResponse, activityTree, incidents, stats] = await Promise.all([
        getProcessDefinitionBpmn20Xml({ client, path: { id: definitionId } }).catch(() => null),
        getActivityInstanceTree({ client, path: { id: args.processInstanceId } }).catch(() => null),
        getIncidents({
          client,
          query: { processInstanceId: args.processInstanceId, maxResults: 200 },
        }).catch(() => []),
        getActivityStatistics({
          client,
          path: { id: definitionId },
          query: { failedJobs: true },
        }).catch(() => []),
      ])

      const bpmnXml = (xmlResponse as { bpmn20Xml?: string } | null)?.bpmn20Xml ?? ""

      // Collect active activity IDs from tree
      interface TreeNode {
        activityId?: string
        childActivityInstances?: TreeNode[]
        childTransitionInstances?: Array<{ activityId?: string }>
      }
      function collect(node: TreeNode | null): string[] {
        if (!node) return []
        const ids: string[] = []
        if (node.activityId) ids.push(node.activityId)
        for (const c of node.childActivityInstances ?? []) ids.push(...collect(c))
        for (const t of node.childTransitionInstances ?? []) {
          if (t.activityId) ids.push(t.activityId)
        }
        return ids
      }
      const activeActivityIds = collect(activityTree as TreeNode | null)

      const incidentRows = Array.isArray(incidents)
        ? (incidents as Array<{ activityId?: string | null }>)
        : []
      const incidentActivityIds = [
        ...new Set(incidentRows.map((i) => i.activityId).filter(Boolean) as string[]),
      ]

      const statRows = Array.isArray(stats)
        ? (stats as Array<{ id?: string | null; instances?: number; failedJobs?: number }>)
        : []
      const activityStats = statRows.map((s) => ({
        id: s.id ?? "",
        instances: s.instances ?? 0,
        failedJobs: s.failedJobs ?? 0,
      }))

      return buildSingleWidgetView({
        widget: "camunda7:bpmn-viewer",
        app: "camunda7",
        dataType: "camunda7:bpmnViewer",
        title: "BPMN Viewer",
        data: {
          bpmnXml,
          processInstanceId: args.processInstanceId,
          processDefinitionId: definitionId,
          activeActivityIds,
          incidentActivityIds,
          activityStats,
        },
      })
    },
  )

  // --- Deployment Browser ---
  server.tool(
    {
      name: "camunda7_show_deployment_browser",
      title: "Deployment Browser",
      description: "Show deployed resources grouped by deployment with metadata.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        name: z.string().optional().describe("Filter by deployment name"),
        maxResults: z.number().optional().default(20),
      }),
      _meta: uiMeta,
    },
    async (args) => {
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
        data: { totalCount: rows.length, deployments: withResources },
      })
    },
  )

  // --- Job Panel ---
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
      }),
      _meta: uiMeta,
    },
    async (args) => {
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
        },
      })
    },
  )
}
