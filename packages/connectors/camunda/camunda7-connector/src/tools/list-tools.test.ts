import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import type { Client } from "@miragon-ai/camunda7-client"

vi.mock("@miragon-ai/camunda7-client/sdk", () => ({
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
  getExternalTasks: vi.fn(),
  getExternalTasksCount: vi.fn(),
  // unrelated endpoints imported by the same tool files
  setExternalTaskResourceRetries: vi.fn(),
  fetchAndLock: vi.fn(),
  completeExternalTaskResource: vi.fn(),
  handleFailure: vi.fn(),
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

import * as sdk from "@miragon-ai/camunda7-client/sdk"
import { paginatedListOutput } from "../lib/pagination.js"
import { createEngineRegistry, type EngineRegistry } from "../lib/resolve-engine.js"
import { registerProcessInstanceTools } from "./process-instances.js"
import { registerTaskTools } from "./tasks.js"
import { registerJobTools } from "./jobs.js"
import { registerIncidentTools } from "./incidents.js"
import { registerHistoryTools } from "./history.js"
import { registerExternalTaskTools } from "./external-tasks.js"

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
  registerExternalTaskTools,
)

const fakeClient = { fake: true } as unknown as Client

/** Single-engine registry → resolveEngine falls back to it without a saved default. */
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
 * One row per converted list tool: the mocked page/count endpoints, the
 * filter args, and — where the engine names or encodes them differently —
 * the engine query they must become (`engineQuery`, default: the args as
 * given) on BOTH the page and the count query (without pagination params).
 */
interface ListCase {
  tool: string
  list: (typeof sdk)[keyof typeof sdk]
  count: (typeof sdk)[keyof typeof sdk]
  filterArgs: Record<string, unknown>
  engineQuery?: Record<string, unknown>
}

const cases: readonly ListCase[] = [
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
    filterArgs: { assignee: "demo" },
    engineQuery: { taskAssignee: "demo" },
  },
  {
    tool: "camunda7_query_historic_variable_instances",
    list: sdk.getHistoricVariableInstances,
    count: sdk.getHistoricVariableInstancesCount,
    filterArgs: { variableName: "amount" },
  },
  {
    tool: "camunda7_list_external_tasks",
    list: sdk.getExternalTasks,
    count: sdk.getExternalTasksCount,
    filterArgs: {
      topicName: "invoice-mail",
      workerId: "worker-1",
      locked: true,
      notLocked: false,
      withRetriesLeft: false,
      noRetriesLeft: true,
      processInstanceId: "pi-1",
      processDefinitionKey: "invoice",
      activityId: "send-mail",
    },
    // A false flag is never forwarded (the engine ignores it): it becomes
    // its complement, which here agrees with the true one already given.
    engineQuery: {
      topicName: "invoice-mail",
      workerId: "worker-1",
      locked: true,
      noRetriesLeft: true,
      processInstanceId: "pi-1",
      processDefinitionKey: "invoice",
      activityId: "send-mail",
    },
  },
]

describe.each(cases)("$tool pagination envelope", ({ tool, list, count, filterArgs, ...c }) => {
  const engineQuery = c.engineQuery ?? filterArgs
  const mockedList = vi.mocked(list as typeof sdk.getProcessInstances)
  const mockedCount = vi.mocked(count as typeof sdk.getProcessInstancesCount)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("advertises the pagination envelope as outputSchema", () => {
    expect(tools.get(tool)?.outputSchema).toBe(paginatedListOutput)
  })

  it("returns { items, totalCount, hasMore, nextOffset } when more pages exist", async () => {
    const page = [{ id: "a" }, { id: "b" }]
    mockedList.mockResolvedValueOnce(page)
    mockedCount.mockResolvedValueOnce({ count: 7 })

    const result = await callTool(tool, { ...filterArgs, firstResult: 2, maxResults: 2 })

    // hasMore because totalCount (7) > firstResult (2) + items.length (2)
    expect(result).toEqual({ items: page, totalCount: 7, hasMore: true, nextOffset: 4 })
    expect(paginatedListOutput.safeParse(result).success).toBe(true)
    // The page query carries the offset; the count query gets the filters
    // only — no pagination or sorting params.
    expect(mockedList).toHaveBeenCalledWith(
      expect.objectContaining({
        client: fakeClient,
        query: expect.objectContaining({ ...engineQuery, firstResult: 2, maxResults: 2 }),
      }),
    )
    expect(mockedCount).toHaveBeenCalledWith({ client: fakeClient, query: engineQuery })
    const countQuery = mockedCount.mock.calls[0][0]?.query as Record<string, unknown>
    expect(countQuery).not.toHaveProperty("firstResult")
    expect(countQuery).not.toHaveProperty("maxResults")
  })

  it("reports hasMore=false without nextOffset when the page is the full result", async () => {
    const page = [{ id: "a" }]
    mockedList.mockResolvedValueOnce(page)
    mockedCount.mockResolvedValueOnce({ count: 1 })

    const result = await callTool(tool, { ...filterArgs, firstResult: 0, maxResults: 20 })

    expect(result).toEqual({ items: page, totalCount: 1, hasMore: false })
    expect(result).not.toHaveProperty("nextOffset")
  })
})

/**
 * The engine sorts external tasks only by an explicit sortBy+sortOrder PAIR
 * (either alone is a 400), so the tool pairs them: sortBy alone sorts
 * ascending, a lone sortOrder is dropped.
 */
describe("camunda7_list_external_tasks", () => {
  const EXTERNAL = "camunda7_list_external_tasks"
  const pageQuery = async (args: Record<string, unknown>) => {
    vi.mocked(sdk.getExternalTasks).mockResolvedValueOnce([])
    vi.mocked(sdk.getExternalTasksCount).mockResolvedValueOnce({ count: 0 })
    await callTool(EXTERNAL, { firstResult: 0, maxResults: 20, ...args })
    const query = vi.mocked(sdk.getExternalTasks).mock.calls[0][0]?.query as Record<string, unknown>
    const countQuery = vi.mocked(sdk.getExternalTasksCount).mock.calls[0][0]?.query as Record<
      string,
      unknown
    >
    return { query, countQuery }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("is a read-only, paged query that says it never touches a task", () => {
    const config = tools.get(EXTERNAL)
    expect(config?.category).toBe("external-tasks")
    expect(config?.annotations).toEqual({
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    })
    expect(config?.description).toContain("it never locks, completes or fails a task")
    expect(config?.description).toMatch(
      /If hasMore is true, call again with firstResult = nextOffset\.$/,
    )
  })

  it("defaults sortOrder to asc when only sortBy is given", async () => {
    const { query, countQuery } = await pageQuery({ sortBy: "lockExpirationTime" })
    expect(query).toMatchObject({ sortBy: "lockExpirationTime", sortOrder: "asc" })
    expect(countQuery).not.toHaveProperty("sortBy")
    expect(countQuery).not.toHaveProperty("sortOrder")
  })

  it("keeps an explicit sortOrder next to its sortBy", async () => {
    const { query } = await pageQuery({ sortBy: "taskPriority", sortOrder: "desc" })
    expect(query).toMatchObject({ sortBy: "taskPriority", sortOrder: "desc" })
  })

  it("drops a lone sortOrder — the engine rejects it without sortBy", async () => {
    const { query } = await pageQuery({ sortOrder: "desc" })
    expect(query).not.toHaveProperty("sortBy")
    expect(query).not.toHaveProperty("sortOrder")
  })
})

describe("envelope degradation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("falls back to firstResult + items.length (hasMore=false) when the count is unusable", async () => {
    vi.mocked(sdk.getJobs).mockResolvedValueOnce([{ id: "j1" }, { id: "j2" }] as never)
    vi.mocked(sdk.getJobsCount).mockResolvedValueOnce(undefined)

    const result = await callTool("camunda7_list_jobs", { firstResult: 3, maxResults: 2 })

    expect(result).toEqual({
      items: [{ id: "j1" }, { id: "j2" }],
      totalCount: 5,
      hasMore: false,
    })
  })

  it("treats a non-array list response as an empty page", async () => {
    vi.mocked(sdk.getIncidents).mockResolvedValueOnce(undefined)
    vi.mocked(sdk.getIncidentsCount).mockResolvedValueOnce({ count: 0 })

    const result = await callTool("camunda7_list_incidents", {})

    expect(result).toEqual({ items: [], totalCount: 0, hasMore: false })
  })
})

describe("camunda7_set_external_task_retries", () => {
  it("sets the retries on exactly the given external task and echoes them", async () => {
    vi.mocked(sdk.setExternalTaskResourceRetries).mockResolvedValue(undefined)

    const result = await callTool("camunda7_set_external_task_retries", {
      externalTaskId: "ext-1",
      retries: 3,
    })

    expect(sdk.setExternalTaskResourceRetries).toHaveBeenCalledWith({
      client: fakeClient,
      path: { id: "ext-1" },
      body: { retries: 3 },
    })
    expect(result).toEqual({ success: true, externalTaskId: "ext-1", retries: 3 })
  })

  it("is a non-destructive, idempotent operations write — never a read", () => {
    expect(tools.get("camunda7_set_external_task_retries")?.annotations).toEqual({
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    })
  })
})
