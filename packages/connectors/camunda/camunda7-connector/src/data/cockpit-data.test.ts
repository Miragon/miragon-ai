import { beforeEach, describe, expect, it, vi } from "vitest"

// The dashboard and list half of `cockpit-data.ts`; the instance-detail and
// job-panel builders live in `cockpit-data-detail.test.ts` (split to stay inside
// the per-file line budget). `cockpit-data.ts` imports the whole SDK surface, so
// the factory has to name every export even though this file drives only a subset.
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
  getIncidents,
  getProcessDefinitionStatistics,
  getProcessDefinitions,
  getProcessDefinitionsCount,
  getProcessInstances,
  getProcessInstancesCount,
} from "@miragon-ai/camunda7-client/sdk"

import {
  buildCockpitDashboardData,
  buildProcessInstancesData,
  buildProcessListData,
} from "./cockpit-data.js"

const mockedIncidents = vi.mocked(getIncidents)
const mockedStats = vi.mocked(getProcessDefinitionStatistics)
const mockedDefs = vi.mocked(getProcessDefinitions)
const mockedDefsCount = vi.mocked(getProcessDefinitionsCount)
const mockedInstances = vi.mocked(getProcessInstances)
const mockedInstancesCount = vi.mocked(getProcessInstancesCount)

const fakeClient = {} as Parameters<typeof buildCockpitDashboardData>[0]

/** Last `query` a mocked SDK call was invoked with — the filter mapping is half
 *  the contract of these builders, so the tests assert on it directly. */
function lastQuery(fn: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const call = fn.mock.calls.at(-1)?.[0] as { query?: Record<string, unknown> }
  return call.query ?? {}
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("buildCockpitDashboardData", () => {
  it("aggregates the statistics rows and sorts by issue count, then instances", async () => {
    mockedStats.mockResolvedValueOnce([
      {
        id: "K1:1:a",
        instances: 10,
        failedJobs: 0,
        incidents: [],
        definition: { id: "K1:1:a", key: "K1", name: "Quiet", version: 1 },
      },
      {
        id: "K2:1:b",
        instances: 3,
        failedJobs: 2,
        incidents: [{ incidentType: "failedJob", incidentCount: 4 }],
        definition: { id: "K2:1:b", key: "K2", name: "Noisy", version: 2 },
      },
      {
        id: "K3:1:c",
        instances: 7,
        failedJobs: 0,
        incidents: [],
        definition: { id: "K3:1:c", key: "K3", name: "Quiet but busier", version: 1 },
      },
    ] as never)

    const data = await buildCockpitDashboardData(fakeClient, "engine-a")

    expect(data.summary).toEqual({
      totalDefinitions: 3,
      totalRunningInstances: 20,
      totalFailedJobs: 2,
      totalIncidents: 4,
    })
    // K2 has 6 issues → first; K1 and K3 tie at 0 issues, so the busier one wins.
    expect(data.definitions.map((d) => d.key)).toEqual(["K2", "K1", "K3"])
    expect(data.definitions[0].incidents).toEqual([{ incidentType: "failedJob", incidentCount: 4 }])
    expect(data.definitions[0].name).toBe("Noisy")
    expect(data.definitions[0].version).toBe(2)
    expect(data.engineId).toBe("engine-a")
  })

  it("defaults missing counters and names instead of emitting undefined", async () => {
    mockedStats.mockResolvedValueOnce([
      { id: "K1:1:a", definition: { id: "K1:1:a", key: "K1", version: 1 } },
    ] as never)

    const data = await buildCockpitDashboardData(fakeClient, "engine-a")

    expect(data.definitions[0]).toEqual({
      id: "K1:1:a",
      key: "K1",
      name: null,
      version: 1,
      instances: 0,
      failedJobs: 0,
      incidents: [],
    })
    expect(data.summary.totalRunningInstances).toBe(0)
  })

  it("falls back to definitions + incidents when the statistics endpoint fails", async () => {
    mockedStats.mockRejectedValueOnce(new Error("403"))
    mockedDefs.mockResolvedValueOnce([
      { id: "K1:1:a", key: "K1", name: "One", version: 1 },
      { id: "K2:1:b", key: "K2", name: "Two", version: 1 },
    ] as never)
    mockedIncidents.mockResolvedValueOnce([
      { processDefinitionId: "K1:1:a" },
      { processDefinitionId: "K1:1:a" },
    ] as never)

    const data = await buildCockpitDashboardData(fakeClient, "engine-b")

    expect(data.summary.totalDefinitions).toBe(2)
    // The fallback cannot know running instances or failed jobs.
    expect(data.summary.totalRunningInstances).toBe(0)
    expect(data.summary.totalFailedJobs).toBe(0)
    expect(data.summary.totalIncidents).toBe(2)
    expect(data.definitions[0].key).toBe("K1")
    expect(data.definitions[0].incidents).toEqual([{ incidentType: "failedJob", incidentCount: 2 }])
    // A definition without incidents gets an empty list, not a synthetic row.
    expect(data.definitions[1].incidents).toEqual([])
  })

  it("survives an incident outage inside the fallback path", async () => {
    mockedStats.mockRejectedValueOnce(new Error("403"))
    mockedDefs.mockResolvedValueOnce([{ id: "K1:1:a", key: "K1", version: 1 }] as never)
    mockedIncidents.mockRejectedValueOnce(new Error("boom"))

    const data = await buildCockpitDashboardData(fakeClient, "engine-b")

    expect(data.summary.totalIncidents).toBe(0)
    expect(data.definitions).toHaveLength(1)
  })

  it("treats a non-array statistics response as empty", async () => {
    mockedStats.mockResolvedValueOnce({ message: "nope" } as never)

    const data = await buildCockpitDashboardData(fakeClient, "engine-a")

    expect(data.definitions).toEqual([])
    expect(data.summary.totalDefinitions).toBe(0)
  })
})

describe("buildProcessListData", () => {
  it("forwards the filters and reports the engine-side total", async () => {
    mockedDefs.mockResolvedValueOnce([{ id: "K1:1:a", key: "K1" }] as never)
    mockedDefsCount.mockResolvedValueOnce({ count: 42 })

    const data = await buildProcessListData(fakeClient, "engine-a", {
      key: "K1",
      nameLike: "Ord",
      latestVersion: false,
      firstResult: 20,
      maxResults: 10,
    })

    expect(lastQuery(mockedDefs)).toMatchObject({
      key: "K1",
      nameLike: "Ord",
      latestVersion: false,
      firstResult: 20,
      maxResults: 10,
      sortBy: "name",
      sortOrder: "asc",
    })
    expect(data.totalCount).toBe(42)
    expect(data.filters).toEqual({ key: "K1", nameLike: "Ord", latestVersion: false })
    expect(data.engineId).toBe("engine-a")
  })

  it("defaults latestVersion to true and paging to the first page of 50", async () => {
    mockedDefs.mockResolvedValueOnce([] as never)
    mockedDefsCount.mockResolvedValueOnce({ count: 0 })

    const data = await buildProcessListData(fakeClient, "engine-a", {})

    expect(lastQuery(mockedDefs)).toMatchObject({
      latestVersion: true,
      firstResult: 0,
      maxResults: 50,
    })
    expect(data.filters.latestVersion).toBe(true)
  })

  it("clamps a negative firstResult to zero", async () => {
    mockedDefs.mockResolvedValueOnce([] as never)
    mockedDefsCount.mockResolvedValueOnce({ count: 0 })

    await buildProcessListData(fakeClient, "engine-a", { firstResult: -5 })

    expect(lastQuery(mockedDefs).firstResult).toBe(0)
  })

  it("degrades to the page length when the count call fails", async () => {
    mockedDefs.mockResolvedValueOnce([{ id: "a" }, { id: "b" }] as never)
    mockedDefsCount.mockRejectedValueOnce(new Error("boom"))

    const data = await buildProcessListData(fakeClient, "engine-a", {})

    expect(data.totalCount).toBe(2)
  })

  it("degrades to the page length when the count response carries no number", async () => {
    mockedDefs.mockResolvedValueOnce([{ id: "a" }] as never)
    mockedDefsCount.mockResolvedValueOnce({ count: "many" } as never)

    const data = await buildProcessListData(fakeClient, "engine-a", {})

    expect(data.totalCount).toBe(1)
  })
})

describe("buildProcessInstancesData", () => {
  beforeEach(() => {
    mockedInstances.mockResolvedValue([] as never)
    mockedInstancesCount.mockResolvedValue({ count: 0 })
    mockedDefs.mockResolvedValue([] as never)
    mockedIncidents.mockResolvedValue([] as never)
  })

  it("maps instances, derives key + version and flags incidents", async () => {
    mockedInstances.mockResolvedValueOnce([
      { id: "p1", definitionId: "K1:7:dep", businessKey: "BK-1", suspended: false },
      { id: "p2", definitionId: "K1:7:dep", businessKey: null, suspended: true },
    ] as never)
    mockedIncidents.mockResolvedValueOnce([{ processInstanceId: "p2" }] as never)
    mockedInstancesCount.mockResolvedValueOnce({ count: 9 })
    mockedDefs.mockResolvedValueOnce([{ name: "Order Process" }] as never)

    const data = await buildProcessInstancesData(fakeClient, "engine-a", {
      processDefinitionKey: "K1",
    })

    expect(data.instances[0]).toEqual({
      id: "p1",
      businessKey: "BK-1",
      processDefinitionKey: "K1",
      version: 7,
      suspended: false,
      hasIncident: false,
    })
    expect(data.instances[1]).toMatchObject({
      businessKey: null,
      suspended: true,
      hasIncident: true,
    })
    expect(data.processDefinitionName).toBe("Order Process")
    expect(data.totalCount).toBe(9)
    expect(data.returnedCount).toBe(2)
    expect(data.withIncidentCount).toBe(1)
    expect(data.suspendedCount).toBe(1)
  })

  it("only forwards the boolean filters when they are set", async () => {
    await buildProcessInstancesData(fakeClient, "engine-a", {
      active: false,
      suspended: false,
      withIncidentsOnly: false,
      businessKeyLike: "",
    })

    const query = lastQuery(mockedInstances)
    expect(query.active).toBeUndefined()
    expect(query.suspended).toBeUndefined()
    expect(query.withIncident).toBeUndefined()
    expect(query.businessKeyLike).toBeUndefined()
  })

  it("forwards the set filters as `true`", async () => {
    await buildProcessInstancesData(fakeClient, "engine-a", {
      active: true,
      suspended: true,
      withIncidentsOnly: true,
      businessKeyLike: "BK",
    })

    expect(lastQuery(mockedInstances)).toMatchObject({
      active: true,
      suspended: true,
      withIncident: true,
      businessKeyLike: "BK",
    })
  })

  it("skips the name lookup when unscoped and reports a null key", async () => {
    const data = await buildProcessInstancesData(fakeClient, "engine-a", {})

    expect(mockedDefs).not.toHaveBeenCalled()
    expect(data.processDefinitionKey).toBeNull()
    expect(data.processDefinitionName).toBeNull()
  })

  it("degrades to the returned count when the count call fails", async () => {
    mockedInstances.mockResolvedValueOnce([{ id: "p1" }] as never)
    mockedInstancesCount.mockRejectedValueOnce(new Error("boom"))

    const data = await buildProcessInstancesData(fakeClient, "engine-a", {})

    expect(data.totalCount).toBe(1)
  })

  it("drops rows without an id and nulls an unparseable version", async () => {
    mockedInstances.mockResolvedValueOnce([
      { id: "", definitionId: "K1:1:a" },
      { id: "p1", definitionId: "legacy-id" },
    ] as never)

    const data = await buildProcessInstancesData(fakeClient, "engine-a", {})

    expect(data.instances).toHaveLength(1)
    expect(data.instances[0]).toMatchObject({ id: "p1", version: null })
  })

  it("defaults paging to the first page of 50", async () => {
    await buildProcessInstancesData(fakeClient, "engine-a", {})

    expect(lastQuery(mockedInstances)).toMatchObject({
      firstResult: 0,
      maxResults: 50,
      sortBy: "businessKey",
      sortOrder: "asc",
    })
  })
})
