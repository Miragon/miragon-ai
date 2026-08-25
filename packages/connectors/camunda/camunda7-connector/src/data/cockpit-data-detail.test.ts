import { beforeEach, describe, expect, it, vi } from "vitest"
import { cibsevenProvider } from "../providers/index.js"

// The instance-detail and job-panel half of `cockpit-data.ts`; the dashboard and
// list builders live in `cockpit-data.test.ts` (split to stay inside the
// per-file line budget). `cockpit-data.ts` imports the whole SDK surface, so the
// factory has to name every export even though this file drives only a subset.
vi.mock("@miragon-ai/camunda7-client/sdk", () => ({
  getActivityInstanceTree: vi.fn(),
  getIncidents: vi.fn(),
  getJobs: vi.fn(),
  getJobsCount: vi.fn(),
  getProcessDefinitionBpmn20Xml: vi.fn(),
  getProcessDefinitionStatistics: vi.fn(),
  getProcessDefinitions: vi.fn(),
  getProcessDefinitionsCount: vi.fn(),
  getProcessInstance: vi.fn(),
  getProcessInstanceVariables: vi.fn(),
  getProcessInstances: vi.fn(),
  getProcessInstancesCount: vi.fn(),
  getTasks: vi.fn(),
}))

vi.mock("../tools/task-form.js", () => ({ buildTaskFormSchema: vi.fn() }))

import {
  getActivityInstanceTree,
  getIncidents,
  getJobs,
  getJobsCount,
  getProcessDefinitionBpmn20Xml,
  getProcessInstance,
  getProcessInstanceVariables,
  getTasks,
} from "@miragon-ai/camunda7-client/sdk"
import { buildTaskFormSchema } from "../tools/task-form.js"

import { buildInstanceDetailData, buildJobPanelData } from "./cockpit-data.js"

const mockedActivityTree = vi.mocked(getActivityInstanceTree)
const mockedIncidents = vi.mocked(getIncidents)
const mockedJobs = vi.mocked(getJobs)
const mockedJobsCount = vi.mocked(getJobsCount)
const mockedBpmn = vi.mocked(getProcessDefinitionBpmn20Xml)
const mockedInstance = vi.mocked(getProcessInstance)
const mockedVariables = vi.mocked(getProcessInstanceVariables)
const mockedTasks = vi.mocked(getTasks)
const mockedFormSchema = vi.mocked(buildTaskFormSchema)

const fakeClient = {} as Parameters<typeof buildJobPanelData>[0]

/** Last `query` a mocked SDK call was invoked with — the filter mapping is half
 *  the contract of these builders, so the tests assert on it directly. */
function lastQuery(fn: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const call = fn.mock.calls.at(-1)?.[0] as { query?: Record<string, unknown> }
  return call.query ?? {}
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("buildInstanceDetailData", () => {
  beforeEach(() => {
    mockedInstance.mockResolvedValue({ id: "p1", definitionId: "K1:3:dep" })
    mockedActivityTree.mockResolvedValue({
      activityId: "root",
      childActivityInstances: [{ activityId: "A1" }],
    })
    mockedVariables.mockResolvedValue({})
    mockedIncidents.mockResolvedValue([] as never)
    mockedTasks.mockResolvedValue([] as never)
    mockedBpmn.mockResolvedValue({ bpmn20Xml: "<xml/>" })
    mockedFormSchema.mockResolvedValue({ taskId: "t1", fields: [] })
  })

  it("collects the BPMN xml and the active + incident activity ids", async () => {
    mockedIncidents.mockResolvedValueOnce([
      { id: "i1", activityId: "A1", incidentType: "failedJob" },
    ] as never)

    const data = await buildInstanceDetailData(fakeClient, "engine-a", {
      processInstanceId: "p1",
    })

    expect(data.bpmnXml).toBe("<xml/>")
    expect(data.activeActivityIds).toEqual(["root", "A1"])
    expect(data.incidentActivityIds).toEqual(["A1"])
    expect(data.engineId).toBe("engine-a")
  })

  it("builds per-incident cockpit links when engine urls are supplied", async () => {
    mockedIncidents.mockResolvedValueOnce([
      { id: "i1", processInstanceId: "p1", incidentType: "failedJob" },
    ] as never)

    const data = await buildInstanceDetailData(
      fakeClient,
      "engine-a",
      { processInstanceId: "p1" },
      { baseUrl: "http://localhost:8080/engine-rest", provider: cibsevenProvider },
    )

    const [incident] = data.incidents ?? []
    expect(incident?.cockpitInstanceUrl).toContain("p1")
  })

  it("leaves the cockpit link null without engine urls", async () => {
    mockedIncidents.mockResolvedValueOnce([{ id: "i1" }] as never)

    const data = await buildInstanceDetailData(fakeClient, "engine-a", {
      processInstanceId: "p1",
    })

    // Missing fields fall back rather than shipping undefined into the widget.
    expect(data.incidents).toEqual([
      expect.objectContaining({
        cockpitInstanceUrl: null,
        processInstanceId: "p1",
        incidentType: "unknown",
        incidentMessage: null,
        incidentTimestamp: "",
      }),
    ])
  })

  it("degrades to a null xml when the BPMN fetch fails", async () => {
    mockedBpmn.mockRejectedValueOnce(new Error("boom"))

    const data = await buildInstanceDetailData(fakeClient, "engine-a", {
      processInstanceId: "p1",
    })

    expect(data.bpmnXml).toBeNull()
  })

  it("skips the BPMN fetch entirely when the instance carries no definition id", async () => {
    mockedInstance.mockResolvedValueOnce({ id: "p1" })

    const data = await buildInstanceDetailData(fakeClient, "engine-a", {
      processInstanceId: "p1",
    })

    expect(mockedBpmn).not.toHaveBeenCalled()
    expect(data.bpmnXml).toBeNull()
  })

  it("attaches a form schema per open task and degrades to an empty one on failure", async () => {
    mockedTasks.mockResolvedValueOnce([
      { id: "t1", taskDefinitionKey: "Task_1", processDefinitionId: "K1:3:dep" },
      { id: "t2", taskDefinitionKey: "Task_2", processDefinitionId: "K1:3:dep" },
    ] as never)
    mockedFormSchema
      .mockResolvedValueOnce({ taskId: "t1", fields: [{ id: "amount" }] } as never)
      .mockRejectedValueOnce(new Error("no form"))

    const data = await buildInstanceDetailData(fakeClient, "engine-a", {
      processInstanceId: "p1",
    })

    expect(data.openTasks).toHaveLength(2)
    expect(data.openTasks[0].formSchema).toMatchObject({ taskId: "t1" })
    expect(data.openTasks[1].formSchema).toEqual({ taskId: "t2", fields: [] })
  })
})

describe("buildJobPanelData", () => {
  beforeEach(() => {
    mockedJobs.mockResolvedValue([] as never)
    mockedJobsCount.mockResolvedValue({ count: 0 })
  })

  const job = (over: Record<string, unknown> = {}) => ({
    id: "j1",
    processInstanceId: "p1",
    retries: 0,
    suspended: false,
    priority: 50,
    ...over,
  })

  it("reports the global all-jobs total when not filtered to failures", async () => {
    mockedJobs.mockResolvedValueOnce([job()] as never)
    mockedJobsCount
      .mockResolvedValueOnce({ count: 4 }) // failed
      .mockResolvedValueOnce({ count: 17 }) // all

    const data = await buildJobPanelData(fakeClient, "engine-a", {})

    expect(data.totalCount).toBe(17)
    expect(data.failedCount).toBe(4)
    expect(lastQuery(mockedJobs).noRetriesLeft).toBeUndefined()
  })

  it("reports the failed total and filters the page when failedOnly is set", async () => {
    mockedJobsCount.mockResolvedValueOnce({ count: 4 }).mockResolvedValueOnce({ count: 17 })

    const data = await buildJobPanelData(fakeClient, "engine-a", { failedOnly: true })

    expect(data.totalCount).toBe(4)
    expect(lastQuery(mockedJobs).noRetriesLeft).toBe(true)
    expect(data.filters).toEqual({ processDefinitionKey: undefined, failedOnly: true })
  })

  it("nulls the optional job fields instead of shipping undefined", async () => {
    mockedJobs.mockResolvedValueOnce([job({ retries: 3, suspended: true, priority: 10 })] as never)

    const data = await buildJobPanelData(fakeClient, "engine-a", {})

    expect(data.jobs[0]).toEqual({
      id: "j1",
      processInstanceId: "p1",
      processDefinitionKey: null,
      processDefinitionId: null,
      activityId: null,
      retries: 3,
      exceptionMessage: null,
      dueDate: null,
      suspended: true,
      priority: 10,
      createTime: null,
    })
  })

  it("degrades to zero failures and the page length when both counts fail", async () => {
    mockedJobs.mockResolvedValueOnce([job(), job({ id: "j2" })] as never)
    mockedJobsCount.mockRejectedValue(new Error("boom"))

    const data = await buildJobPanelData(fakeClient, "engine-a", {})

    expect(data.failedCount).toBe(0)
    expect(data.totalCount).toBe(2)
  })

  it("returns an empty page when the job list call fails", async () => {
    mockedJobs.mockRejectedValueOnce(new Error("boom"))

    const data = await buildJobPanelData(fakeClient, "engine-a", { processDefinitionKey: "K1" })

    expect(data.jobs).toEqual([])
    expect(lastQuery(mockedJobsCount)).toMatchObject({ processDefinitionKey: "K1" })
  })

  it("defaults paging to the first page of 50", async () => {
    await buildJobPanelData(fakeClient, "engine-a", {})

    expect(lastQuery(mockedJobs)).toMatchObject({
      firstResult: 0,
      maxResults: 50,
      sortBy: "jobId",
      sortOrder: "desc",
    })
  })
})
