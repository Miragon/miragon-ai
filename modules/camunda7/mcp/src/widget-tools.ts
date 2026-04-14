import { z } from "zod"
import type { MCPServer } from "mcp-use/server"
import { text } from "mcp-use/server"
import type { Client } from "@automation-mcp/client-camunda7"
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
} from "@automation-mcp/client-camunda7/generated/sdk.gen"

export function registerWidgetTools(
  server: MCPServer,
  client: Client,
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
      return text(
        JSON.stringify({
          widget: "camunda7:process-list",
          data: {
            definitions,
            totalCount: Array.isArray(definitions) ? definitions.length : 0,
          },
        }),
      )
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
      return text(
        JSON.stringify({
          widget: "camunda7:task-dashboard",
          data: {
            tasks: taskArray,
            totalCount: taskArray.length,
            filters: {
              assignee: args.assignee,
              candidateGroup: args.candidateGroup,
              processDefinitionKey: args.processDefinitionKey,
            },
          },
        }),
      )
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
        getActivityInstanceTree({ client, path: { id: args.processInstanceId } }).catch(
          () => null,
        ),
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

      return text(
        JSON.stringify({
          widget: "camunda7:instance-detail",
          data: { instance, activityTree, variables, incidents, bpmnXml },
        }),
      )
    },
  )

  server.tool(
    {
      name: "camunda7_show_incident_panel",
      title: "Open Incidents",
      description: "Show open incidents grouped by process definition.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
      schema: z.object({
        processDefinitionKey: z.string().optional(),
        incidentType: z.string().optional(),
      }),
      _meta: uiMeta,
    },
    async (args) => {
      const rows = (await getIncidents({
        client,
        query: {
          processDefinitionKeyIn: args.processDefinitionKey,
          incidentType: args.incidentType,
          maxResults: 200,
          sortBy: "incidentTimestamp",
          sortOrder: "desc",
        },
      })) as unknown as Array<{
        id: string
        processDefinitionKey: string
        processDefinitionId: string
        processInstanceId: string
        incidentType: string
        activityId: string
        incidentMessage: string | null
        incidentTimestamp: string
        configuration: string | null
      }>

      const byDefinition = new Map<string, typeof rows>()
      for (const row of rows) {
        const key = row.processDefinitionKey
        const group = byDefinition.get(key) ?? []
        group.push(row)
        byDefinition.set(key, group)
      }

      const definitions = [...byDefinition.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([key, group]) => ({
          processDefinitionKey: key,
          incidentCount: group.length,
          latestIncident: group[0].incidentTimestamp,
          incidents: group.map((r) => ({
            id: r.id,
            processDefinitionId: r.processDefinitionId,
            processInstanceId: r.processInstanceId,
            incidentType: r.incidentType,
            activityId: r.activityId,
            incidentMessage: r.incidentMessage ?? null,
            incidentTimestamp: r.incidentTimestamp,
            configuration: r.configuration ?? null,
          })),
        }))

      return text(
        JSON.stringify({
          widget: "camunda7:incident-panel",
          data: { totalCount: rows.length, definitions },
        }),
      )
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

      const instArray = Array.isArray(instances) ? instances : []
      const actArray = Array.isArray(activities) ? activities : []
      const inst = instArray[0] ?? null

      return text(
        JSON.stringify({
          widget: "camunda7:history-timeline",
          data: {
            processInstance: inst,
            activities: actArray,
            totalActivities: actArray.length,
          },
        }),
      )
    },
  )
}
