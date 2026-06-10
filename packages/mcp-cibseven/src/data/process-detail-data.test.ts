import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@miragon-ai/client-cibseven/generated/sdk.gen", () => ({
  getActivityStatistics: vi.fn(),
  getProcessDefinitions: vi.fn(),
  getProcessDefinitionBpmn20Xml: vi.fn(),
  getProcessDefinitionStatistics: vi.fn(),
}))

import {
  getActivityStatistics,
  getProcessDefinitions,
  getProcessDefinitionBpmn20Xml,
  getProcessDefinitionStatistics,
} from "@miragon-ai/client-cibseven/generated/sdk.gen"

import { buildProcessDetailData } from "./process-detail-data.js"

const mockedGetActivityStats = vi.mocked(getActivityStatistics)
const mockedGetDefs = vi.mocked(getProcessDefinitions)
const mockedGetBpmn = vi.mocked(getProcessDefinitionBpmn20Xml)
const mockedGetDefinitionStats = vi.mocked(getProcessDefinitionStatistics)

const fakeClient = {} as Parameters<typeof buildProcessDetailData>[0]
const baseUrl = "http://localhost:8080/engine-rest"

describe("buildProcessDetailData", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetActivityStats.mockResolvedValue([] as never)
    mockedGetBpmn.mockResolvedValue(null as never)
  })

  it("picks the latest version when stats lists multiple", async () => {
    mockedGetDefinitionStats.mockResolvedValueOnce([
      {
        id: "K1:1:a",
        instances: 5,
        definition: { id: "K1:1:a", key: "K1", name: "K1", version: 1 },
      },
      {
        id: "K1:3:c",
        instances: 9,
        definition: { id: "K1:3:c", key: "K1", name: "K1", version: 3 },
      },
      {
        id: "K1:2:b",
        instances: 7,
        definition: { id: "K1:2:b", key: "K1", name: "K1", version: 2 },
      },
    ] as never)

    const data = await buildProcessDetailData(fakeClient, {
      baseUrl,
      processDefinitionKey: "K1",
    })

    expect(data.version).toBe(3)
    expect(data.runningInstances).toBe(9)
    expect(mockedGetDefs).not.toHaveBeenCalled()
  })

  it("falls back to /process-definition when stats has no matching key", async () => {
    mockedGetDefinitionStats.mockResolvedValueOnce([] as never)
    mockedGetDefs.mockResolvedValueOnce([
      { id: "K2:1:abc", key: "K2", name: "K2 name", version: 1 },
    ] as never)

    const data = await buildProcessDetailData(fakeClient, {
      baseUrl,
      processDefinitionKey: "K2",
    })

    expect(data.version).toBe(1)
    expect(data.processDefinitionName).toBe("K2 name")
    // Fallback path: definition has no running instances
    expect(data.runningInstances).toBe(0)
    expect(mockedGetDefs).toHaveBeenCalledWith({
      client: fakeClient,
      query: { keysIn: "K2", latestVersion: true },
    })
  })

  it("returns null info when neither stats nor /process-definition has the key", async () => {
    mockedGetDefinitionStats.mockResolvedValueOnce([] as never)
    mockedGetDefs.mockResolvedValueOnce([] as never)

    const data = await buildProcessDetailData(fakeClient, {
      baseUrl,
      processDefinitionKey: "missing",
    })

    expect(data.processDefinitionKey).toBe("missing")
    expect(data.processDefinitionName).toBeNull()
    expect(data.version).toBeNull()
    expect(data.runningInstances).toBeNull()
    expect(data.openIncidents).toBe(0)
    expect(data.activities).toEqual([])
    // No id resolved → BPMN/activity calls must not run
    expect(mockedGetActivityStats).not.toHaveBeenCalled()
    expect(mockedGetBpmn).not.toHaveBeenCalled()
  })

  it("aggregates totals, keeps token-bearing activities for the heatmap, drops idle ones", async () => {
    mockedGetDefinitionStats.mockResolvedValueOnce([
      {
        id: "K3:1:x",
        instances: 100,
        definition: { id: "K3:1:x", key: "K3", name: "K3", version: 1 },
      },
    ] as never)
    mockedGetActivityStats.mockResolvedValueOnce([
      { id: "A1", instances: 5, failedJobs: 2, incidents: [{ incidentCount: 3 }] },
      { id: "A2", instances: 8, failedJobs: 0, incidents: [{ incidentCount: 7 }] },
      // Truly idle — no tokens, no problems → dropped entirely.
      { id: "A3", instances: 0, failedJobs: 0, incidents: [] },
      // Failed-jobs-only — kept (affected) even with zero incidents.
      { id: "A4", instances: 3, failedJobs: 4, incidents: [] },
      // Running-only — kept for the heatmap, but NOT counted as affected.
      { id: "A5", instances: 6, failedJobs: 0, incidents: [] },
    ] as never)

    const data = await buildProcessDetailData(fakeClient, {
      baseUrl,
      processDefinitionKey: "K3",
    })

    expect(data.openIncidents).toBe(10)
    expect(data.failedJobs).toBe(6)
    // Affected = incident or failed-job activities only (A1, A2, A4).
    expect(data.affectedActivityCount).toBe(3)
    // A3 (idle) dropped; rest sorted by incidents desc, then instances desc.
    expect(data.activities.map((a) => a.activityId)).toEqual(["A2", "A1", "A5", "A4"])
    // Per-activity running token counts are surfaced for the diagram heatmap.
    expect(data.activities.find((a) => a.activityId === "A2")?.instances).toBe(8)
  })

  it("uses BPMN names and activity count when XML is present", async () => {
    mockedGetDefinitionStats.mockResolvedValueOnce([
      { id: "K4:1:x", instances: 2, definition: { id: "K4:1:x", key: "K4", version: 1 } },
    ] as never)
    mockedGetActivityStats.mockResolvedValueOnce([
      { id: "A1", incidents: [{ incidentCount: 1 }] },
    ] as never)
    mockedGetBpmn.mockResolvedValueOnce({
      bpmn20Xml: `<?xml version="1.0"?>
        <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <bpmn:process id="K4">
            <bpmn:startEvent id="S" />
            <bpmn:serviceTask id="A1" name="Resolved Name" />
            <bpmn:endEvent id="E" />
          </bpmn:process>
        </bpmn:definitions>`,
    } as never)

    const data = await buildProcessDetailData(fakeClient, {
      baseUrl,
      processDefinitionKey: "K4",
    })

    expect(data.bpmnXml).toContain("Resolved Name")
    expect(data.totalActivityCount).toBeGreaterThan(0)
    expect(data.activities[0].activityName).toBe("Resolved Name")
  })

  it("survives SDK failures by returning safe defaults", async () => {
    mockedGetDefinitionStats.mockRejectedValueOnce(new Error("network"))
    mockedGetDefs.mockRejectedValueOnce(new Error("network"))

    const data = await buildProcessDetailData(fakeClient, {
      baseUrl,
      processDefinitionKey: "K5",
    })

    expect(data.processDefinitionKey).toBe("K5")
    expect(data.openIncidents).toBe(0)
    expect(data.activities).toEqual([])
  })
})
