import { afterEach, describe, expect, it } from "vitest"
import {
  clientFor,
  startFakeEngine,
  type FakeEngine,
  type FakeRoutes,
  type RecordedRequest,
} from "../tools/test-support/fake-engine.js"
import { buildClusterDetailData, buildEngineHealthData } from "./health-data.js"

/**
 * The health builders against a recording engine: every total is a `/count`
 * or the per-key statistics (the capped scan only feeds the clusters), and
 * incident timestamps order by instant — never as strings (#335 N71).
 */

const engines: FakeEngine[] = []
afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.close()))
})

// The DST fall-back hour: textually "02:30+0200" sorts after "02:10+0100",
// but the +0100 stamp is 40 minutes LATER.
const BEFORE_FALL_BACK = "2026-10-25T02:30:00.000+0200"
const AFTER_FALL_BACK = "2026-10-25T02:10:00.000+0100"

const incident = (id: string, incidentTimestamp: string, activityId = "charge") => ({
  id,
  processDefinitionId: "order:2:d2",
  processInstanceId: `pi-${id}`,
  activityId,
  incidentType: "failedJob",
  incidentMessage: "card declined",
  incidentTimestamp,
})

async function engineWith(routes: FakeRoutes) {
  const engine = await startFakeEngine(routes, { body: [] })
  engines.push(engine)
  return { engine, client: clientFor(engine) }
}

describe("buildEngineHealthData — exact totals", () => {
  it("reads the recency windows from /count and the landscape from per-key statistics", async () => {
    const { engine, client } = await engineWith({
      // Newest first, as the engine sorts it.
      "GET /incident": { body: [incident("b", AFTER_FALL_BACK), incident("a", BEFORE_FALL_BACK)] },
      "GET /incident/count": (r: RecordedRequest) => ({
        body: { count: r.query.incidentTimestampAfter ? 1 : 2 },
      }),
      "GET /process-definition/statistics": {
        body: [
          {
            id: "order:1:d1",
            instances: 38,
            incidents: [{ incidentCount: 1 }],
            definition: { key: "order", version: 1 },
          },
          {
            id: "order:2:d2",
            instances: 61,
            incidents: [{ incidentCount: 1 }],
            definition: { key: "order", version: 2 },
          },
          { id: "idle:1:x", instances: 4, incidents: [], definition: { key: "idle", version: 1 } },
        ],
      },
      "GET /history/process-instance/count": { body: { count: 12 } },
    })

    const data = await buildEngineHealthData(client, "fake")

    expect(data.summary).toEqual({
      totalIncidents: 2,
      lastHourIncidents: 1,
      last24hIncidents: 1,
      affectedActivities: 1,
      affectedDefinitions: 1,
      runningInstances: 103,
      totalDefinitions: 2,
      started24h: 12,
      completed24h: 12,
    })
    const counts = engine.requests.filter((r) => r.path === "/incident/count").map((r) => r.query)
    expect(counts).toEqual([
      {},
      { incidentTimestampAfter: expect.any(String) as string },
      { incidentTimestampAfter: expect.any(String) as string },
    ])
    // N71: the cluster's latest incident by instant, not by string.
    expect(data.clusters[0].latestIncident).toBe(AFTER_FALL_BACK)
  })

  it("reports the affected activities as unknown (null) when the scan is capped", async () => {
    const scan = Array.from({ length: 2000 }, (_, n) =>
      incident(`i${n}`, "2026-10-09T10:00:00.000+0000", `a${n % 3}`),
    )
    const { client } = await engineWith({
      "GET /incident": { body: scan },
      "GET /incident/count": { body: { count: 5000 } },
      "GET /history/process-instance/count": { body: { count: 0 } },
    })

    const data = await buildEngineHealthData(client, "fake")

    expect(data.summary.totalIncidents).toBe(5000)
    expect(data.summary.affectedActivities).toBeNull()
    expect(data.headline).toBe("Critical — 5000 open incidents")
  })
})

describe("buildClusterDetailData — first/latest by instant (#335 N71)", () => {
  it("orders the cluster's timestamps across a DST fall-back correctly", async () => {
    const { client } = await engineWith({
      "GET /incident": { body: [incident("b", AFTER_FALL_BACK), incident("a", BEFORE_FALL_BACK)] },
    })

    const data = await buildClusterDetailData(client, "fake", {
      activityId: "charge",
      incidentType: "failedJob",
    })

    expect(data.firstSeen).toBe(BEFORE_FALL_BACK)
    expect(data.latestIncident).toBe(AFTER_FALL_BACK)
  })
})
