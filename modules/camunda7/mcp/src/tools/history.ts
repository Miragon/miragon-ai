import { z } from "zod"
import type { Client } from "@automation-mcp/client-camunda7"
import type { createToolRegistrar } from "@automation-mcp/core"
import {
  getHistoricProcessInstances,
  getHistoricActivityInstances,
  getHistoricTaskInstances,
  getHistoricVariableInstances,
} from "@automation-mcp/client-camunda7/generated/sdk.gen"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export function registerHistoryTools(register: Register) {
  register({
    name: "camunda7_query_historic_process_instances",
    description:
      "Query historic process instances with filters. Returns completed and running instances from history.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
      finished: z.boolean().optional().describe("Only finished instances"),
      unfinished: z.boolean().optional().describe("Only unfinished (running) instances"),
      startedBefore: z.string().optional().describe("Started before date (ISO 8601)"),
      startedAfter: z.string().optional().describe("Started after date (ISO 8601)"),
      maxResults: z.number().int().positive().optional().default(20),
      sortBy: z
        .enum([
          "instanceId",
          "definitionId",
          "definitionKey",
          "definitionName",
          "startTime",
          "endTime",
          "duration",
          "tenantId",
          "businessKey",
        ])
        .optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    },
    handler: async (client, args) =>
      getHistoricProcessInstances({
        client,
        query: {
          processDefinitionKey: args.processDefinitionKey,
          finished: args.finished,
          unfinished: args.unfinished,
          startedBefore: args.startedBefore,
          startedAfter: args.startedAfter,
          maxResults: args.maxResults,
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
        },
      }),
  })

  register({
    name: "camunda7_query_historic_activity_instances",
    description:
      "Query historic activity instances. Shows which BPMN activities were executed in a process instance.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      processInstanceId: z.string().optional().describe("Filter by process instance ID"),
      activityType: z
        .string()
        .optional()
        .describe("Filter by activity type (e.g. userTask, serviceTask)"),
      finished: z.boolean().optional().describe("Only finished activities"),
      unfinished: z.boolean().optional().describe("Only unfinished activities"),
      maxResults: z.number().int().positive().optional().default(50),
      sortBy: z
        .enum([
          "activityInstanceId",
          "instanceId",
          "executionId",
          "activityId",
          "activityName",
          "activityType",
          "startTime",
          "endTime",
          "duration",
          "tenantId",
        ])
        .optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    },
    handler: async (client, args) =>
      getHistoricActivityInstances({
        client,
        query: {
          processInstanceId: args.processInstanceId,
          activityType: args.activityType,
          finished: args.finished,
          unfinished: args.unfinished,
          maxResults: args.maxResults,
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
        },
      }),
  })

  register({
    name: "camunda7_query_historic_task_instances",
    description:
      "Query historic task instances. Shows completed and open user tasks from history.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      processInstanceId: z.string().optional().describe("Filter by process instance ID"),
      processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
      taskAssignee: z.string().optional().describe("Filter by assignee"),
      finished: z.boolean().optional().describe("Only finished tasks"),
      unfinished: z.boolean().optional().describe("Only unfinished tasks"),
      maxResults: z.number().int().positive().optional().default(20),
      sortBy: z
        .enum([
          "taskId",
          "activityInstanceId",
          "processDefinitionId",
          "processInstanceId",
          "executionId",
          "duration",
          "endTime",
          "startTime",
          "taskName",
          "taskDescription",
          "assignee",
          "owner",
          "dueDate",
          "followUpDate",
          "deleteReason",
          "taskDefinitionKey",
          "priority",
          "tenantId",
        ])
        .optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    },
    handler: async (client, args) =>
      getHistoricTaskInstances({
        client,
        query: {
          processInstanceId: args.processInstanceId,
          processDefinitionKey: args.processDefinitionKey,
          taskAssignee: args.taskAssignee,
          finished: args.finished,
          unfinished: args.unfinished,
          maxResults: args.maxResults,
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
        },
      }),
  })

  register({
    name: "camunda7_query_historic_variable_instances",
    description: "Query historic variable instances. Shows variable values from process history.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      processInstanceId: z.string().optional().describe("Filter by process instance ID"),
      variableName: z.string().optional().describe("Filter by exact variable name"),
      variableNameLike: z.string().optional().describe("Filter by variable name pattern"),
      maxResults: z.number().int().positive().optional().default(50),
      sortBy: z.enum(["instanceId", "variableName", "tenantId"]).optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    },
    handler: async (client, args) =>
      getHistoricVariableInstances({
        client,
        query: {
          processInstanceId: args.processInstanceId,
          variableName: args.variableName,
          variableNameLike: args.variableNameLike,
          maxResults: args.maxResults,
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
        },
      }),
  })
}
