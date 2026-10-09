import { afterEach, describe, expect, it } from "vitest"
import { cibsevenProvider } from "../providers/index.js"
import {
  clientFor,
  startFakeEngine,
  type FakeEngine,
  type FakeRoutes,
  type RecordedRequest,
} from "../tools/test-support/fake-engine.js"
import { buildActivityIncidentsData, buildProcessIncidentsData } from "./process-incidents-data.js"

/**
 * The definition view is about a KEY (#335 N60): old versions keep running
 * after a redeploy, so every number spans all versions — only the diagram is
 * one version, and it is labelled (`diagramVersion`). The fixture is the
 * playground shape the review measured: `leasing` v1 still runs next to v2.
 */

const engines: FakeEngine[] = []
afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.close()))
})

const KEY = "leasing"
const V1 = "leasing:1:d1"
const V2 = "leasing:2:d2"
const XML =
  '<definitions><process id="leasing"><serviceTask id="assess" name="Assess creditworthiness"/><serviceTask id="sendPolicy" name="Send policy"/></process></definitions>'

const row = (n: number, activityId: string, definitionId: string) => ({
  id: `inc-${activityId}-${n}`,
  processDefinitionId: definitionId,
  processInstanceId: `pi-${activityId}-${n}`,
  activityId,
  incidentType: "failedJob",
  incidentMessage: `${activityId} failed`,
  // Newest first, one minute apart.
  incidentTimestamp: new Date(Date.UTC(2026, 9, 10, 12, 0) - n * 60_000).toISOString(),
  configuration: `job-${n}`,
})

/** The key's counts and a scan; `incidentTotal` is what /incident/count reports. */
function definitionRoutes(scan: unknown[], incidentTotal: number): FakeRoutes {
  return {
    [`GET /process-definition/key/${KEY}`]: {
      body: { id: V2, key: KEY, name: "Leasing", version: 2 },
    },
    [`GET /process-definition/key/${KEY}/xml`]: { body: { id: V2, bpmn20Xml: XML } },
    "GET /process-instance/count": { body: { count: 99 } },
    "GET /job/count": { body: { count: 6 } },
    "GET /incident/count": (r: RecordedRequest) => ({
      body: { count: r.query.incidentTimestampAfter ? 4 : incidentTotal },
    }),
    "GET /incident": { body: scan },
  }
}

async function build(routes: FakeRoutes) {
  const engine = await startFakeEngine(routes, { body: [] })
  engines.push(engine)
  const data = await buildProcessIncidentsData(clientFor(engine), {
    baseUrl: engine.baseUrl,
    provider: cibsevenProvider,
    processDefinitionKey: KEY,
  })
  return { data, requests: engine.requests }
}

const queriesOf = (requests: RecordedRequest[], path: string) =>
  requests.filter((r) => r.path === path).map((r) => r.query)

describe("buildProcessIncidentsData — key-wide (#335 N60)", () => {
  it("counts every version through key-scoped /count endpoints in one parallel stage (N67)", async () => {
    // A complete scan: three incidents, on v1 AND v2.
    const scan = [row(0, "assess", V2), row(1, "assess", V1), row(2, "oldTask", V1)]
    const { data, requests } = await build(definitionRoutes(scan, 3))

    expect(data).toMatchObject({
      processDefinitionKey: KEY,
      processDefinitionName: "Leasing",
      diagramVersion: 2,
      runningInstances: 99,
      failedJobs: 6,
      incidentCount: 3,
      last24hCount: 4,
      totalActivityCount: 2,
      latestIncident: scan[0].incidentTimestamp,
      siblingsWithIncidents: [],
    })
    // Per activity, across versions; an activity only v1 has keeps its id.
    expect(data.activities).toEqual([
      {
        activityId: "assess",
        activityName: "Assess creditworthiness",
        representativeMessage: "assess failed",
        incidentCount: 2,
        firstSeen: scan[1].incidentTimestamp,
        latestIncident: scan[0].incidentTimestamp,
      },
      {
        activityId: "oldTask",
        activityName: null,
        representativeMessage: "oldTask failed",
        incidentCount: 1,
        firstSeen: scan[2].incidentTimestamp,
        latestIncident: scan[2].incidentTimestamp,
      },
    ])
    expect(queriesOf(requests, "/process-instance/count")).toEqual([{ processDefinitionKey: KEY }])
    expect(queriesOf(requests, "/job/count")).toEqual([
      { processDefinitionKey: KEY, noRetriesLeft: "true" },
    ])
    expect(queriesOf(requests, "/incident/count")).toEqual([
      { processDefinitionKeyIn: KEY },
      { processDefinitionKeyIn: KEY, incidentTimestampAfter: expect.any(String) as string },
    ])
    // The complete scan already holds every incident: no engine-wide
    // statistics, no per-version reads — 7 calls, one stage.
    expect(requests.map((r) => r.path).sort()).toEqual(
      [
        "/incident",
        "/incident/count",
        "/incident/count",
        "/job/count",
        `/process-definition/key/${KEY}`,
        `/process-definition/key/${KEY}/xml`,
        "/process-instance/count",
      ].sort(),
    )
  })

  it("sums the activity statistics of every version with incidents when the scan is capped", async () => {
    // 263 open incidents; the 200-row scan holds only the newest — none of oldTask's.
    const scan = [
      ...Array.from({ length: 180 }, (_, n) => row(n, "assess", n % 2 ? V1 : V2)),
      ...Array.from({ length: 20 }, (_, n) => row(180 + n, "sendPolicy", V2)),
    ]
    const stats = (key: string, id: string, incidentCount: number) => ({
      id,
      instances: 1,
      incidents: [{ incidentType: "failedJob", incidentCount }],
      definition: { id, key, version: Number(id.split(":")[1]) },
    })
    const { data, requests } = await build({
      ...definitionRoutes(scan, 263),
      "GET /process-definition/statistics": {
        body: [stats(KEY, V1, 113), stats(KEY, V2, 150), stats("other", "other:1:x", 9)],
      },
      [`GET /process-definition/${V1}/statistics`]: {
        body: [
          { id: "assess", incidents: [{ incidentCount: 100 }] },
          { id: "oldTask", incidents: [{ incidentCount: 13 }] },
        ],
      },
      [`GET /process-definition/${V2}/statistics`]: {
        body: [
          { id: "assess", incidents: [{ incidentCount: 120 }] },
          { id: "sendPolicy", incidents: [{ incidentCount: 30 }] },
          { id: "idle", incidents: [] },
        ],
      },
    })

    // Exact per-activity counts summing to the key's 263 — the old view
    // showed v2 only (150) next to a key-wide total.
    expect(data.activities.map((a) => [a.activityId, a.incidentCount])).toEqual([
      ["assess", 220],
      ["sendPolicy", 30],
      ["oldTask", 13],
    ])
    // The scan holds only part of each activity: firstSeen is unknown (null),
    // never the oldest SCANNED timestamp passed off as the first.
    expect(data.activities.map((a) => a.firstSeen)).toEqual([null, null, null])
    expect(data.activities[2]).toMatchObject({ representativeMessage: null, latestIncident: null })
    expect(queriesOf(requests, `/process-definition/${V1}/statistics`)).toEqual([
      { incidents: "true" },
    ])
    expect(queriesOf(requests, `/process-definition/${V2}/statistics`)).toHaveLength(1)
    expect(queriesOf(requests, "/process-definition/statistics")).toEqual([{ incidents: "true" }])
  })

  it("offers the keys that DO have incidents when this one has none — null when unreadable", async () => {
    const siblings = await build({
      ...definitionRoutes([], 0),
      "GET /process-definition/statistics": {
        body: [
          {
            id: "b:1:x",
            incidents: [{ incidentCount: 2 }],
            definition: { key: "b", name: "B", version: 1 },
          },
          {
            id: "b:2:x",
            incidents: [{ incidentCount: 3 }],
            definition: { key: "b", name: "B", version: 2 },
          },
          { id: V2, incidents: [], definition: { key: KEY, version: 2 } },
        ],
      },
    })
    expect(siblings.data.siblingsWithIncidents).toEqual([
      { processDefinitionKey: "b", processDefinitionName: "B", incidentCount: 5 },
    ])

    const unreadable = await build({
      ...definitionRoutes([], 0),
      "GET /process-definition/statistics": { status: 500, body: { message: "boom" } },
    })
    expect(unreadable.data.siblingsWithIncidents).toBeNull()
    expect(unreadable.data.incidentCount).toBe(0)
  })
})

describe("buildActivityIncidentsData — one page of an activity's incidents (N67)", () => {
  it("pages engine-side with the exact total and links each row to its own version", async () => {
    const engine = await startFakeEngine({
      "GET /incident": { body: [row(0, "assess", V1)] },
      "GET /incident/count": { body: { count: 57 } },
    })
    engines.push(engine)

    const data = await buildActivityIncidentsData(clientFor(engine), {
      baseUrl: engine.baseUrl,
      provider: cibsevenProvider,
      processDefinitionKey: KEY,
      activityId: "assess",
      firstResult: 10,
    })

    expect(data.totalCount).toBe(57)
    // The cockpit route of the row's OWN version (v1), not the latest.
    expect(data.incidents[0].cockpitInstanceUrl).toContain(`/process/${KEY}/1/pi-assess-0`)
    expect(engine.requests.map((r) => [r.path, r.query])).toEqual(
      expect.arrayContaining([
        [
          "/incident",
          {
            processDefinitionKeyIn: KEY,
            activityId: "assess",
            sortBy: "incidentTimestamp",
            sortOrder: "desc",
            firstResult: "10",
            maxResults: "10",
          },
        ],
        ["/incident/count", { processDefinitionKeyIn: KEY, activityId: "assess" }],
      ]),
    )
    // No statistics or definition lookup per expanded group.
    expect(engine.requests).toHaveLength(2)
  })
})
