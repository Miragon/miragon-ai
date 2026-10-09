import { describe, expect, it } from "vitest"
import { fetchAndLockInput, listExternalTasksInput } from "./index.js"

describe("listExternalTasksInput", () => {
  it("pages by default: firstResult 0, maxResults 20", () => {
    expect(listExternalTasksInput.parse({})).toEqual({ firstResult: 0, maxResults: 20 })
  })

  it("accepts every filter the read-only query forwards", () => {
    const filters = {
      topicName: "invoice-mail",
      workerId: "worker-1",
      locked: true,
      notLocked: false,
      withRetriesLeft: true,
      noRetriesLeft: false,
      processInstanceId: "pi-1",
      processDefinitionKey: "invoice",
      activityId: "send-mail",
      sortBy: "lockExpirationTime",
      sortOrder: "desc",
    }
    expect(listExternalTasksInput.parse(filters)).toEqual({
      ...filters,
      firstResult: 0,
      maxResults: 20,
    })
  })

  it("rejects a non-positive page size and unknown sort fields", () => {
    expect(listExternalTasksInput.safeParse({ maxResults: 0 }).success).toBe(false)
    expect(listExternalTasksInput.safeParse({ maxResults: 1.5 }).success).toBe(false)
    expect(listExternalTasksInput.safeParse({ firstResult: -1 }).success).toBe(false)
    expect(listExternalTasksInput.safeParse({ sortBy: "workerId" }).success).toBe(false)
    expect(listExternalTasksInput.safeParse({ sortOrder: "up" }).success).toBe(false)
  })

  it("offers exactly the engine's external-task sort fields", () => {
    expect(listExternalTasksInput.shape.sortBy.unwrap().options).toEqual([
      "id",
      "lockExpirationTime",
      "processInstanceId",
      "processDefinitionId",
      "processDefinitionKey",
      "taskPriority",
      "tenantId",
    ])
  })

  it.each(["locked", "notLocked", "withRetriesLeft", "noRetriesLeft"] as const)(
    "tells the model what %s=false selects (sent as the complementary flag)",
    (flag) => {
      expect(listExternalTasksInput.shape[flag].description).toMatch(/^true = .+, false = only /)
    },
  )

  it("documents the sort pairing on sortOrder", () => {
    expect(listExternalTasksInput.shape.sortOrder.description).toContain("ignored without sortBy")
  })
})

describe("fetchAndLockInput (worker protocol, kept as published API)", () => {
  it("still defaults to 10 tasks locked for 5 minutes", () => {
    expect(fetchAndLockInput.parse({ workerId: "w", topics: [{ topicName: "t" }] })).toEqual({
      workerId: "w",
      maxTasks: 10,
      topics: [{ topicName: "t", lockDuration: 300000 }],
    })
  })
})
