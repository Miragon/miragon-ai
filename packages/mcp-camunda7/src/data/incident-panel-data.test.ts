import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@miragon-ai/client-camunda7/sdk", () => ({
  getIncidents: vi.fn(),
  getProcessDefinitions: vi.fn(),
  getProcessDefinitionBpmn20Xml: vi.fn(),
  getProcessDefinitionStatistics: vi.fn(),
}))

import {
  getIncidents,
  getProcessDefinitions,
  getProcessDefinitionBpmn20Xml,
  getProcessDefinitionStatistics,
} from "@miragon-ai/client-camunda7/sdk"

import {
  buildIncidentsDashboardData,
  buildProcessIncidentsData,
  processDefinitionKeyFromId,
} from "./incident-panel-data.js"

const mockedGetIncidents = vi.mocked(getIncidents)
const mockedGetStats = vi.mocked(getProcessDefinitionStatistics)
const mockedGetBpmn = vi.mocked(getProcessDefinitionBpmn20Xml)
const mockedGetDefs = vi.mocked(getProcessDefinitions)

// --- Builder integration tests against a mocked SDK -------------------------

/** Mirrors the real `/incident` REST response — note: NO `processDefinitionKey`.
 *  CIB seven returns only `processDefinitionId`; the helper derives the key. */
interface IncidentRowFixture {
  id: string
  processDefinitionId: string
  processInstanceId: string
  incidentType: string
  activityId: string
  incidentMessage: string | null
  incidentTimestamp: string
  configuration: string | null
}

function incident(over: Partial<IncidentRowFixture>): IncidentRowFixture {
  return {
    id: "i?",
    processDefinitionId: "K1:1:abc",
    processInstanceId: "p?",
    incidentType: "failedJob",
    activityId: "A1",
    incidentMessage: "boom",
    incidentTimestamp: "2026-04-01T00:00:00.000Z",
    configuration: null,
    ...over,
  }
}

const fakeClient = {} as Parameters<typeof buildIncidentsDashboardData>[0]

describe("processDefinitionKeyFromId", () => {
  it("extracts the key from the canonical Camunda 7 id format", () => {
    expect(processDefinitionKeyFromId("miraveloLeasing:3:abc-123")).toBe("miraveloLeasing")
  })
  it("handles tenant-scoped keys without colons in them", () => {
    expect(processDefinitionKeyFromId("Order_Process:1:def")).toBe("Order_Process")
  })
  it("falls back to the full id when no separator is present", () => {
    expect(processDefinitionKeyFromId("legacy-id-no-colons")).toBe("legacy-id-no-colons")
  })
  it("handles an empty id gracefully", () => {
    expect(processDefinitionKeyFromId("")).toBe("")
  })
})

describe("buildIncidentsDashboardData", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetDefs.mockResolvedValue([] as never)
  })

  it("aggregates incidents by process and activity, sorted desc", async () => {
    mockedGetIncidents.mockResolvedValueOnce([
      incident({ id: "i1", activityId: "A1", incidentTimestamp: "2026-04-03T00:00:00.000Z" }),
      incident({ id: "i2", activityId: "A1", incidentTimestamp: "2026-04-02T00:00:00.000Z" }),
      incident({ id: "i3", activityId: "A2", incidentTimestamp: "2026-04-01T00:00:00.000Z" }),
      incident({
        id: "i4",
        processDefinitionId: "K2:1:xyz",
        activityId: "B1",
        incidentTimestamp: "2026-04-01T00:00:00.000Z",
      }),
    ] as never)
    mockedGetStats.mockResolvedValueOnce([
      {
        id: "K1:1:abc",
        instances: 100,
        definition: { id: "K1:1:abc", key: "K1", name: "Process 1", version: 1 },
      },
      {
        id: "K2:1:xyz",
        instances: 50,
        definition: { id: "K2:1:xyz", key: "K2", name: "Process 2", version: 3 },
      },
    ] as never)

    const data = await buildIncidentsDashboardData(fakeClient, {
      baseUrl: "http://localhost:8080/engine-rest",
    })

    expect(data.totalCount).toBe(4)
    expect(data.processCount).toBe(2)
    expect(data.processes[0].processDefinitionKey).toBe("K1") // 3 incidents → first
    expect(data.processes[0].processDefinitionName).toBe("Process 1")
    expect(data.processes[0].runningInstances).toBe(100)
    expect(data.processes[0].activities[0].activityId).toBe("A1")
    expect(data.processes[0].activities[0].incidentCount).toBe(2)
    expect(data.processes[0].activities[1].activityId).toBe("A2")
    expect(data.processes[1].processDefinitionKey).toBe("K2")
    expect(data.affectedActivityCount).toBe(3) // A1 + A2 + B1
  })

  it("computes last24hCount against the cutoff at the process and activity level", async () => {
    const now = new Date("2026-04-25T12:00:00.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)
    try {
      mockedGetIncidents.mockResolvedValueOnce([
        incident({ id: "fresh", activityId: "A1", incidentTimestamp: "2026-04-25T11:00:00.000Z" }),
        incident({ id: "old", activityId: "A1", incidentTimestamp: "2026-04-23T00:00:00.000Z" }),
        incident({ id: "old2", activityId: "A2", incidentTimestamp: "2026-04-22T00:00:00.000Z" }),
      ] as never)
      mockedGetStats.mockResolvedValueOnce([] as never)

      const data = await buildIncidentsDashboardData(fakeClient, {
        baseUrl: "http://localhost:8080/engine-rest",
      })

      expect(data.last24hCount).toBe(1)
      expect(data.processes[0].last24hCount).toBe(1)
      const a1 = data.processes[0].activities.find((a) => a.activityId === "A1")
      const a2 = data.processes[0].activities.find((a) => a.activityId === "A2")
      expect(a1?.last24hCount).toBe(1)
      expect(a2?.last24hCount).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it("compares offset-format engine timestamps by instant, not lexicographically", async () => {
    // Cutoff instant: 2026-04-24T12:00:00Z. The engine emits local-offset
    // timestamps (`…+0200`), which do NOT order lexicographically against a
    // Zulu cutoff string — both failure directions are locked in here.
    const now = new Date("2026-04-25T12:00:00.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(now)
    try {
      mockedGetIncidents.mockResolvedValueOnce([
        // 14:00Z → inside the window, but the string sorts BELOW the cutoff.
        incident({ id: "in", activityId: "A1", incidentTimestamp: "2026-04-24T11:00:00.000-0300" }),
        // 11:00Z → outside the window, but the string sorts ABOVE the cutoff.
        incident({
          id: "out",
          activityId: "A1",
          incidentTimestamp: "2026-04-24T13:00:00.000+0200",
        }),
      ] as never)
      mockedGetStats.mockResolvedValueOnce([] as never)

      const data = await buildIncidentsDashboardData(fakeClient, {
        baseUrl: "http://localhost:8080/engine-rest",
      })

      expect(data.last24hCount).toBe(1)
      const a1 = data.processes[0].activities[0]
      expect(a1.last24hCount).toBe(1)
      // min/max also order by instant: 14:00Z is the LATER instant even though
      // its string sorts below the "+0200" one.
      expect(a1.latestIncident).toBe("2026-04-24T11:00:00.000-0300")
      expect(a1.firstSeen).toBe("2026-04-24T13:00:00.000+0200")
    } finally {
      vi.useRealTimers()
    }
  })

  it("falls back to getProcessDefinitions when stats omit a definition", async () => {
    mockedGetIncidents.mockResolvedValueOnce([incident({ id: "i1" })] as never)
    mockedGetStats.mockResolvedValueOnce([] as never) // stats outage / no instances
    mockedGetDefs.mockResolvedValueOnce([
      { id: "K1:9:def", key: "K1", name: "Renamed", version: 9 },
    ] as never)

    const data = await buildIncidentsDashboardData(fakeClient, {
      baseUrl: "http://localhost:8080/engine-rest",
    })

    expect(data.processes[0].processDefinitionName).toBe("Renamed")
    expect(data.processes[0].version).toBe(9)
    expect(data.processes[0].runningInstances).toBe(0)
    expect(mockedGetDefs).toHaveBeenCalledOnce()
  })

  it("returns the canonical empty shape when there are no incidents", async () => {
    mockedGetIncidents.mockResolvedValueOnce([] as never)

    const data = await buildIncidentsDashboardData(fakeClient, {
      baseUrl: "http://localhost:8080/engine-rest",
    })

    expect(data).toEqual({
      totalCount: 0,
      processCount: 0,
      affectedActivityCount: 0,
      last24hCount: 0,
      latestIncident: null,
      processes: [],
    })
    expect(mockedGetStats).not.toHaveBeenCalled()
  })
})

describe("buildProcessIncidentsData", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetDefs.mockResolvedValue([] as never)
  })

  it("returns rich per-process detail with BPMN, activity names and Cockpit URLs", async () => {
    mockedGetIncidents.mockResolvedValueOnce([
      incident({ id: "i1", activityId: "A1", incidentTimestamp: "2026-04-03T00:00:00.000Z" }),
      incident({ id: "i2", activityId: "A1", incidentTimestamp: "2026-04-02T00:00:00.000Z" }),
      incident({ id: "i3", activityId: "A2", incidentTimestamp: "2026-04-01T00:00:00.000Z" }),
    ] as never)
    mockedGetStats.mockResolvedValueOnce([
      {
        id: "K1:1:abc",
        instances: 42,
        definition: { id: "K1:1:abc", key: "K1", name: "Process 1", version: 5 },
      },
    ] as never)
    mockedGetBpmn.mockResolvedValueOnce({
      bpmn20Xml: `<bpmn:userTask id="A1" name="Approve" /><bpmn:serviceTask id="A2" name="Send" />`,
    } as never)

    const data = await buildProcessIncidentsData(fakeClient, {
      baseUrl: "http://localhost:8080/engine-rest",
      processDefinitionKey: "K1",
    })

    expect(data.processDefinitionName).toBe("Process 1")
    expect(data.version).toBe(5)
    expect(data.runningInstances).toBe(42)
    expect(data.bpmnXml).toContain("Approve")
    expect(data.activities).toHaveLength(2)
    expect(data.activities[0]).toMatchObject({
      activityId: "A1",
      activityName: "Approve",
      incidentCount: 2,
    })
    expect(data.activities[0].incidents).toHaveLength(2)
    expect(data.totalActivityCount).toBe(2)
    // Each instance carries only the lean six fields — confirm no extras.
    expect(Object.keys(data.activities[0].incidents[0]).sort()).toEqual([
      "cockpitInstanceUrl",
      "id",
      "incidentMessage",
      "incidentTimestamp",
      "incidentType",
      "processInstanceId",
    ])
    expect(data.cockpitUrl).toBe(
      "http://localhost:8080/webapp/#/seven/auth/process/K1/5?tab=incidents",
    )
    // Per-incident cockpit URL nests the instance under the process route.
    const firstIncident = data.activities[0].incidents[0]
    expect(firstIncident.cockpitInstanceUrl).toBe(
      `http://localhost:8080/webapp/#/seven/auth/process/K1/5/${encodeURIComponent(firstIncident.processInstanceId)}?tab=incidents`,
    )
  })

  it("degrades gracefully when no incidents and no BPMN are available", async () => {
    // Filtered call → empty; engine-wide stats also empty (no other process
    // has incidents either).
    mockedGetIncidents.mockResolvedValue([] as never)
    mockedGetStats.mockResolvedValue([] as never)

    const data = await buildProcessIncidentsData(fakeClient, {
      baseUrl: "http://localhost:8080/engine-rest",
      processDefinitionKey: "K1",
    })

    expect(data.incidentCount).toBe(0)
    expect(data.activities).toEqual([])
    expect(data.bpmnXml).toBe(null)
    expect(data.totalActivityCount).toBe(null)
    expect(data.latestIncident).toBe(null)
    expect(data.siblingsWithIncidents).toEqual([])
    // Cockpit URL is still emitted because the user might want to jump to an
    // empty Cockpit page directly.
    expect(data.cockpitUrl).toContain("process/K1")
  })

  it("populates siblingsWithIncidents from definition statistics when the requested process is empty", async () => {
    // Filtered call: K1 has no incidents.
    mockedGetIncidents.mockResolvedValueOnce([] as never)

    // Initial definition lookup: K1 only.
    mockedGetStats.mockResolvedValueOnce([] as never)
    // Sibling lookup: cluster stats with incident counts. Return entries
    // in *ascending* count order so the assertion locks in desc-by-count
    // sorting rather than insertion order.
    mockedGetStats.mockResolvedValueOnce([
      {
        id: "K3:1:def",
        instances: 7,
        definition: { id: "K3:1:def", key: "K3", name: null, version: 1 },
        incidents: [{ incidentType: "failedJob", incidentCount: 1 }],
      },
      {
        id: "K2:1:abc",
        instances: 5,
        definition: { id: "K2:1:abc", key: "K2", name: "Process Two", version: 1 },
        incidents: [{ incidentType: "failedJob", incidentCount: 5 }],
      },
      {
        id: "K1:1:abc",
        instances: 1,
        definition: { id: "K1:1:abc", key: "K1", name: "Self", version: 1 },
        incidents: [{ incidentType: "failedJob", incidentCount: 999 }],
      },
    ] as never)

    const data = await buildProcessIncidentsData(fakeClient, {
      baseUrl: "http://localhost:8080/engine-rest",
      processDefinitionKey: "K1",
    })

    expect(data.incidentCount).toBe(0)
    // K1 (self) is excluded; K2 (5) sorts before K3 (1) regardless of
    // engine response order.
    expect(data.siblingsWithIncidents).toEqual([
      { processDefinitionKey: "K2", processDefinitionName: "Process Two", incidentCount: 5 },
      { processDefinitionKey: "K3", processDefinitionName: null, incidentCount: 1 },
    ])
  })

  it("does NOT fetch siblings when the primary group is non-empty", async () => {
    mockedGetIncidents.mockResolvedValueOnce([
      incident({ id: "i1", processDefinitionId: "K1:1:abc", activityId: "A1" }),
    ] as never)
    mockedGetStats.mockResolvedValueOnce([
      {
        id: "K1:1:abc",
        instances: 1,
        definition: { id: "K1:1:abc", key: "K1", name: null, version: 1 },
      },
    ] as never)
    mockedGetBpmn.mockResolvedValueOnce({ bpmn20Xml: "" } as never)

    const data = await buildProcessIncidentsData(fakeClient, {
      baseUrl: "http://localhost:8080/engine-rest",
      processDefinitionKey: "K1",
    })

    expect(data.incidentCount).toBe(1)
    expect(data.siblingsWithIncidents).toEqual([])
    // Only the primary getIncidents call should have happened.
    expect(mockedGetIncidents).toHaveBeenCalledOnce()
  })
})
