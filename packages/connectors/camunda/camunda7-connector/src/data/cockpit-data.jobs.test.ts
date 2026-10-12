import { afterEach, describe, expect, it } from "vitest"
import {
  clientFor,
  startFakeEngine,
  type FakeEngine,
  type FakeRoutes,
  type RecordedRequest,
} from "../tools/test-support/fake-engine.js"
import { buildJobPanelData } from "./cockpit-data.js"

/**
 * The job panel's builder against a recording engine: the exact totals from
 * `/job/count`, the stuck jobs first on every page, and the names of the
 * failing activities and their processes from the diagrams (#322 U11, U13).
 * The failure half is the rejection table in `honest-numbers.test.ts`.
 */

const engines: FakeEngine[] = []
afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.close()))
})

async function engineWith(routes: FakeRoutes) {
  const engine = await startFakeEngine(routes, { body: [] })
  engines.push(engine)
  return { engine, client: clientFor(engine) }
}

const calls = (engine: FakeEngine, path: string) => engine.requests.filter((r) => r.path === path)

describe("buildJobPanelData — exact totals from /job/count", () => {
  const jobRoutes = {
    "GET /job": {
      body: [
        {
          id: "j1",
          processInstanceId: "p1",
          retries: 0,
          suspended: false,
          priority: 0,
          failedActivityId: "charge",
        },
      ],
    },
    "GET /job/count": (r: RecordedRequest) => ({
      body: { count: r.query.noRetriesLeft ? 3 : 120 },
    }),
    "GET /process-definition": { body: [{ id: "K1:1:a", key: "K1", version: 1 }] },
  }

  it("reports both global totals; the page follows failedOnly", async () => {
    const { engine, client } = await engineWith(jobRoutes)

    const all = await buildJobPanelData(client, "engine-a", { processDefinitionKey: "K1" })
    const failed = await buildJobPanelData(client, "engine-a", { failedOnly: true })

    expect([all.totalCount, all.failedCount]).toEqual([120, 3])
    expect([failed.totalCount, failed.failedCount]).toEqual([3, 3])
    expect(calls(engine, "/job").map((r) => r.query)).toEqual([
      // Jobs without retries first, on every page (#322 U11).
      {
        processDefinitionKey: "K1",
        firstResult: "0",
        maxResults: "50",
        sortBy: "jobRetries",
        sortOrder: "asc",
      },
      {
        noRetriesLeft: "true",
        firstResult: "0",
        maxResults: "50",
        sortBy: "jobRetries",
        sortOrder: "asc",
      },
    ])
    // A scoped panel checks its key exists (an unknown key is not-found, not "0 jobs").
    expect(calls(engine, "/process-definition").map((r) => r.query)).toEqual([
      { key: "K1", latestVersion: "true", sortBy: "version", sortOrder: "desc", maxResults: "1" },
    ])
  })

  it("nulls the optional job fields instead of shipping undefined", async () => {
    const { client } = await engineWith(jobRoutes)

    const data = await buildJobPanelData(client, "engine-a", {})

    expect(data.jobs[0]).toEqual({
      id: "j1",
      processInstanceId: "p1",
      processDefinitionKey: null,
      processDefinitionId: null,
      processDefinitionName: null,
      activityId: "charge",
      activityName: null,
      retries: 0,
      exceptionMessage: null,
      dueDate: null,
      suspended: false,
      priority: 0,
      createTime: null,
    })
  })

  it("names each job's activity and process from its version's diagram — once per version", async () => {
    const xml =
      '<definitions><process id="K1" name="Order to cash"><serviceTask id="charge" name="Charge card"/></process></definitions>'
    const job = (id: string, definitionId: string) => ({
      id,
      processInstanceId: "p1",
      processDefinitionKey: "K1",
      processDefinitionId: definitionId,
      retries: 0,
      suspended: false,
      priority: 0,
      failedActivityId: "charge",
    })
    const { engine, client } = await engineWith({
      ...jobRoutes,
      "GET /job": { body: [job("j1", "K1:1:a"), job("j2", "K1:1:a"), job("j3", "K1:2:b")] },
      "GET /process-definition/K1:1:a/xml": { body: { id: "K1:1:a", bpmn20Xml: xml } },
      // Unreadable: its jobs keep their ids, the panel still renders.
      "GET /process-definition/K1:2:b/xml": { status: 500, body: { message: "boom" } },
    })

    const data = await buildJobPanelData(client, "engine-a", {})

    expect(data.jobs.map((j) => [j.activityName, j.processDefinitionName])).toEqual([
      ["Charge card", "Order to cash"],
      ["Charge card", "Order to cash"],
      [null, null],
    ])
    expect(calls(engine, "/process-definition/K1:1:a/xml")).toHaveLength(1)
  })
})
