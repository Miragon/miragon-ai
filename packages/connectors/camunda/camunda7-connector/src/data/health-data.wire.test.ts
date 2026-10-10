import { afterEach, describe, expect, it } from "vitest"
import { engineDateMillis, toEngineDate } from "@miragon-ai/camunda7-client"
import {
  clientFor,
  startFakeEngine,
  type FakeEngine,
  type FakeRoutes,
  type RecordedRequest,
} from "../tools/test-support/fake-engine.js"
import { buildClusterDetailData } from "./cluster-detail-data.js"
import { CLUSTER_SCAN_LIMIT } from "./cluster-scan.js"
import { buildEngineHealthData } from "./health-data.js"

/**
 * The health builders against a recording engine: every total is a `/count`
 * or the per-key statistics, the capped scan only feeds the clusters — and a
 * cluster count the capped scan cannot vouch for is null or a `/count`,
 * never the scan's length — and incident timestamps order by instant, never
 * as strings (#335 N71).
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

/** An engine timestamp `ageMs` ago. */
const ago = (ageMs: number) => toEngineDate(new Date(Date.now() - ageMs))

/**
 * `/incident/count` keyed on the window it is asked for — the parsed cutoff,
 * not just "has a cutoff" — so swapping the hour and the 24h window shows.
 */
function windowedCount(counts: { total: number; lastHour: number; last24h: number }) {
  return (r: RecordedRequest) => {
    const cutoff = engineDateMillis(r.query.incidentTimestampAfter)
    if (cutoff === null) return { body: { count: counts.total } }
    return { body: { count: Date.now() - cutoff < 2 * HOUR ? counts.lastHour : counts.last24h } }
  }
}

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
      "GET /incident/count": windowedCount({ total: 11, lastHour: 3, last24h: 7 }),
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

    // Each window lands in its own field — the hour's count is not the day's.
    expect(data.summary).toEqual({
      totalIncidents: 11,
      lastHourIncidents: 3,
      last24hIncidents: 7,
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

  it("reports what a capped scan cannot vouch for as unknown — totals, cluster sizes, 24h", async () => {
    // A mass failure: the newest 2000 of 5000 incidents, all from the last
    // half hour — the scan reaches back neither to the clusters' start nor 24h.
    const scan = Array.from({ length: CLUSTER_SCAN_LIMIT }, (_, n) =>
      incident(`i${n}`, ago((n * 30 * MINUTE) / CLUSTER_SCAN_LIMIT), `a${n % 3}`),
    )
    const { client } = await engineWith({
      "GET /incident": { body: scan },
      "GET /incident/count": windowedCount({ total: 5000, lastHour: 4000, last24h: 5000 }),
      "GET /history/process-instance/count": { body: { count: 0 } },
    })

    const data = await buildEngineHealthData(client, "fake")

    expect(data.summary.totalIncidents).toBe(5000)
    expect(data.summary.affectedActivities).toBeNull()
    expect(data.headline).toBe("Critical — 5000 open incidents")
    // The top cluster holds 667 of the SCANNED rows — a lower bound, not its size.
    expect(data.clusters[0]).toMatchObject({
      activityId: "a0",
      incidentCount: null,
      scannedIncidentCount: 667,
      last24hCount: null,
    })
  })

  it("keeps a capped scan's 24h cluster counts once the scan reaches back past 24h", async () => {
    // 2000 rows spread over the last 48h: every incident of the last 24h is in it.
    const scan = Array.from({ length: CLUSTER_SCAN_LIMIT }, (_, n) =>
      incident(`i${n}`, ago((n * 48 * HOUR) / CLUSTER_SCAN_LIMIT)),
    )
    const { client } = await engineWith({
      "GET /incident": { body: scan },
      "GET /incident/count": windowedCount({ total: 9000, lastHour: 42, last24h: 1000 }),
      "GET /history/process-instance/count": { body: { count: 0 } },
    })

    const data = await buildEngineHealthData(client, "fake")

    expect(data.clusters[0]).toMatchObject({
      incidentCount: null,
      scannedIncidentCount: CLUSTER_SCAN_LIMIT,
      last24hCount: 1000,
    })
  })

  it("names a long key's cluster by the statistics — its definition id is a bare UUID", async () => {
    const uuid = "6f1c2a9e-0b7d-4c33-9a51-3d2e8f40b7aa"
    const { client } = await engineWith({
      "GET /incident": { body: [{ ...incident("a", ago(MINUTE)), processDefinitionId: uuid }] },
      "GET /incident/count": { body: { count: 1 } },
      "GET /process-definition/statistics": {
        body: [
          {
            id: uuid,
            instances: 1,
            incidents: [{ incidentCount: 1 }],
            definition: { id: uuid, key: "customerOnboardingApprovalProcess", version: 1 },
          },
        ],
      },
    })

    const data = await buildEngineHealthData(client, "fake")

    expect(data.clusters[0].processDefinitionKeys).toEqual(["customerOnboardingApprovalProcess"])
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

describe("buildClusterDetailData — a cluster larger than the scan", () => {
  /** The newest 2000 of a mass failure, all from the last half hour; every other one signature B. */
  const massFailure = () =>
    Array.from({ length: CLUSTER_SCAN_LIMIT }, (_, n) => ({
      ...incident(`i${n}`, ago((n * 30 * MINUTE) / CLUSTER_SCAN_LIMIT)),
      incidentMessage: n % 2 ? "card declined" : "gateway timeout",
    }))

  it("takes the cluster's counts from /incident/count without a message filter", async () => {
    const { engine, client } = await engineWith({
      "GET /incident": { body: massFailure() },
      "GET /incident/count": windowedCount({ total: 5000, lastHour: 2400, last24h: 4800 }),
    })

    const data = await buildClusterDetailData(client, "fake", {
      activityId: "charge",
      incidentType: "failedJob",
    })

    expect(data).toMatchObject({
      incidentCount: 5000,
      scannedIncidentCount: CLUSTER_SCAN_LIMIT,
      lastHourCount: 2400,
      last24hCount: 4800,
      // The oldest SCANNED row is not when the cluster started.
      firstSeen: null,
      totalMatching: CLUSTER_SCAN_LIMIT,
    })
    const filter = { activityId: "charge", incidentType: "failedJob" }
    const counts = engine.requests.filter((r) => r.path === "/incident/count")
    expect(counts.map((r) => r.query)).toEqual(
      expect.arrayContaining([
        filter,
        { ...filter, incidentTimestampAfter: expect.any(String) as string },
      ]),
    )
    expect(counts).toHaveLength(3)
  })

  it("reports a message-filtered cluster's unvouched counts as unknown (null)", async () => {
    const { engine, client } = await engineWith({
      "GET /incident": { body: massFailure() },
    })

    const data = await buildClusterDetailData(client, "fake", {
      activityId: "charge",
      incidentType: "failedJob",
      messageSignature: "card declined",
    })

    expect(data).toMatchObject({
      incidentCount: null,
      scannedIncidentCount: CLUSTER_SCAN_LIMIT / 2,
      lastHourCount: null,
      last24hCount: null,
      firstSeen: null,
      totalMatching: CLUSTER_SCAN_LIMIT / 2,
    })
    // /incident/count cannot filter by message — it is not asked.
    expect(engine.requests.filter((r) => r.path === "/incident/count")).toEqual([])
  })

  it("counts a window from the scan once the scan reaches back past it", async () => {
    // 2000 rows over the last 2h: the hour is covered, 24h is not.
    const scan = Array.from({ length: CLUSTER_SCAN_LIMIT }, (_, n) =>
      incident(`i${n}`, ago((n * 2 * HOUR) / CLUSTER_SCAN_LIMIT)),
    )
    const { client } = await engineWith({ "GET /incident": { body: scan } })

    const data = await buildClusterDetailData(client, "fake", {
      activityId: "charge",
      incidentType: "failedJob",
      messageSignature: "card declined",
    })

    expect(data.lastHourCount).toBe(CLUSTER_SCAN_LIMIT / 2)
    expect(data.last24hCount).toBeNull()
  })
})
