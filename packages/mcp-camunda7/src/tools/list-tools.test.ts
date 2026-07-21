import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import type { Client } from "@miragon-ai/client-camunda7"

vi.mock("@miragon-ai/client-camunda7/sdk", () => ({
  // list endpoints + their /count twins (the surface under test)
  getProcessInstances: vi.fn(),
  getProcessInstancesCount: vi.fn(),
  getTasks: vi.fn(),
  getTasksCount: vi.fn(),
  getJobs: vi.fn(),
  getJobsCount: vi.fn(),
  getIncidents: vi.fn(),
  getIncidentsCount: vi.fn(),
  getHistoricProcessInstances: vi.fn(),
  getHistoricProcessInstancesCount: vi.fn(),
  getHistoricActivityInstances: vi.fn(),
  getHistoricActivityInstancesCount: vi.fn(),
  getHistoricTaskInstances: vi.fn(),
  getHistoricTaskInstancesCount: vi.fn(),
  getHistoricVariableInstances: vi.fn(),
  getHistoricVariableInstancesCount: vi.fn(),
  // unrelated endpoints imported by the same tool files
  startProcessInstanceByKey: vi.fn(),
  getProcessInstance: vi.fn(),
  deleteProcessInstance: vi.fn(),
  modifyProcessInstance: vi.fn(),
  getActivityInstanceTree: vi.fn(),
  getProcessInstanceVariables: vi.fn(),
  setProcessInstanceVariable: vi.fn(),
  updateSuspensionStateById: vi.fn(),
  getTask: vi.fn(),
  claim: vi.fn(),
  unclaim: vi.fn(),
  complete: vi.fn(),
  setAssignee: vi.fn(),
  getTaskVariables: vi.fn(),
  setJobRetries: vi.fn(),
  setJobRetriesAsyncOperation: vi.fn(),
  resolveIncident: vi.fn(),
}))

import * as sdk from "@miragon-ai/client-camunda7/sdk"
import { paginatedListOutput } from "../lib/pagination.js"
import { createEngineRegistry, type EngineRegistry } from "../lib/resolve-engine.js"
import { registerProcessInstanceTools } from "./process-instances.js"
import { registerTaskTools } from "./tasks.js"
import { registerJobTools } from "./jobs.js"
import { registerIncidentTools } from "./incidents.js"
import { registerHistoryTools } from "./history.js"

type Register = Parameters<typeof registerProcessInstanceTools>[0]
type Config = ToolConfig<EngineRegistry>

/** Captures registrar configs instead of registering them on a real server. */
function captureTools(...registerFns: Array<(register: Register) => void>): Map<string, Config> {
  const tools = new Map<string, Config>()
  const register = Object.assign((config: Config) => tools.set(config.name, config), {
    getRegisteredTools: () => [],
  }) as unknown as Register
  for (const fn of registerFns) fn(register)
  return tools
}

const tools = captureTools(
  registerProcessInstanceTools,
  registerTaskTools,
  registerJobTools,
  registerIncidentTools,
  registerHistoryTools,
)

const fakeClient = { fake: true } as unknown as Client

/** Single-engine registry → resolveEngine falls back to it without a session. */
const registry: EngineRegistry = createEngineRegistry(
  [{ id: "default", baseUrl: "http://localhost:8080/engine-rest" }],
  () => fakeClient,
)

function callTool(name: string, args: Record<string, unknown>) {
  const config = tools.get(name)
  if (!config) throw new Error(`tool ${name} not registered`)
  return config.handler(registry, args)
}

/**
 * One row per converted list tool: the mocked page/count endpoints and the
 * filter args that must reach the count query (without pagination params).
 */
const cases = [
  {
    tool: "camunda7_list_process_instances",
    list: sdk.getProcessInstances,
    count: sdk.getProcessInstancesCount,
    filterArgs: { processDefinitionKey: "invoice", active: true },
  },
  {
    tool: "camunda7_list_tasks",
    list: sdk.getTasks,
    count: sdk.getTasksCount,
    filterArgs: { assignee: "demo" },
  },
  {
    tool: "camunda7_list_jobs",
    list: sdk.getJobs,
    count: sdk.getJobsCount,
    filterArgs: { noRetriesLeft: true },
  },
  {
    tool: "camunda7_list_incidents",
    list: sdk.getIncidents,
    count: sdk.getIncidentsCount,
    filterArgs: { incidentType: "failedJob" },
  },
  {
    tool: "camunda7_query_historic_process_instances",
    list: sdk.getHistoricProcessInstances,
    count: sdk.getHistoricProcessInstancesCount,
    filterArgs: { processDefinitionKey: "invoice", finished: true },
  },
  {
    tool: "camunda7_query_historic_activity_instances",
    list: sdk.getHistoricActivityInstances,
    count: sdk.getHistoricActivityInstancesCount,
    filterArgs: { processInstanceId: "pi-1", activityType: "userTask" },
  },
  {
    tool: "camunda7_query_historic_task_instances",
    list: sdk.getHistoricTaskInstances,
    count: sdk.getHistoricTaskInstancesCount,
    filterArgs: { taskAssignee: "demo" },
  },
  {
    tool: "camunda7_query_historic_variable_instances",
    list: sdk.getHistoricVariableInstances,
    count: sdk.getHistoricVariableInstancesCount,
    filterArgs: { variableName: "amount" },
  },
] as const

describe.each(cases)("$tool pagination envelope", ({ tool, list, count, filterArgs }) => {
  const mockedList = vi.mocked(list)
  const mockedCount = vi.mocked(count)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("advertises the pagination envelope as outputSchema", () => {
    expect(tools.get(tool)?.outputSchema).toBe(paginatedListOutput)
  })

  it("returns { items, totalCount, hasMore, nextOffset } when more pages exist", async () => {
    const page = [{ id: "a" }, { id: "b" }]
    mockedList.mockResolvedValueOnce(page as never)
    mockedCount.mockResolvedValueOnce({ count: 7 } as never)

    const result = await callTool(tool, { ...filterArgs, firstResult: 2, maxResults: 2 })

    // hasMore because totalCount (7) > firstResult (2) + items.length (2)
    expect(result).toEqual({ items: page, totalCount: 7, hasMore: true, nextOffset: 4 })
    expect(paginatedListOutput.safeParse(result).success).toBe(true)
    // The page query carries the offset; the count query gets the filters
    // only — no pagination or sorting params.
    expect(mockedList).toHaveBeenCalledWith(
      expect.objectContaining({
        client: fakeClient,
        query: expect.objectContaining({ ...filterArgs, firstResult: 2, maxResults: 2 }),
      }),
    )
    expect(mockedCount).toHaveBeenCalledWith({ client: fakeClient, query: filterArgs })
    const countQuery = mockedCount.mock.calls[0][0]?.query as Record<string, unknown>
    expect(countQuery).not.toHaveProperty("firstResult")
    expect(countQuery).not.toHaveProperty("maxResults")
  })

  it("reports hasMore=false without nextOffset when the page is the full result", async () => {
    const page = [{ id: "a" }]
    mockedList.mockResolvedValueOnce(page as never)
    mockedCount.mockResolvedValueOnce({ count: 1 } as never)

    const result = await callTool(tool, { ...filterArgs, firstResult: 0, maxResults: 20 })

    expect(result).toEqual({ items: page, totalCount: 1, hasMore: false })
    expect(result).not.toHaveProperty("nextOffset")
  })
})

describe("envelope degradation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("falls back to firstResult + items.length (hasMore=false) when the count is unusable", async () => {
    vi.mocked(sdk.getJobs).mockResolvedValueOnce([{ id: "j1" }, { id: "j2" }] as never)
    vi.mocked(sdk.getJobsCount).mockResolvedValueOnce(undefined as never)

    const result = await callTool("camunda7_list_jobs", { firstResult: 3, maxResults: 2 })

    expect(result).toEqual({
      items: [{ id: "j1" }, { id: "j2" }],
      totalCount: 5,
      hasMore: false,
    })
  })

  it("treats a non-array list response as an empty page", async () => {
    vi.mocked(sdk.getIncidents).mockResolvedValueOnce(undefined as never)
    vi.mocked(sdk.getIncidentsCount).mockResolvedValueOnce({ count: 0 } as never)

    const result = await callTool("camunda7_list_incidents", {})

    expect(result).toEqual({ items: [], totalCount: 0, hasMore: false })
  })
})
