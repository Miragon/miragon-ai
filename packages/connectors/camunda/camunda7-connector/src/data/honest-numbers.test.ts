import { readdirSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { toEngineDate, type Client } from "@miragon-ai/camunda7-client"
import { cibsevenProvider } from "../providers/index.js"
import {
  clientFor,
  startFakeEngine,
  type FakeEngine,
  type FakeReply,
  type RecordedRequest,
} from "../tools/test-support/fake-engine.js"
import { ENGINE_FAILURE, readOf, WORLD, worldReply } from "../tools/test-support/engine-world.js"
import { buildBpmnViewerData } from "./bpmn-viewer-data.js"
import {
  buildCockpitDashboardData,
  buildJobPanelData,
  buildProcessInstancesData,
  buildProcessListData,
} from "./cockpit-data.js"
import { buildClusterDetailData } from "./cluster-detail-data.js"
import { CLUSTER_SCAN_LIMIT } from "./cluster-scan.js"
import { countOf, INCIDENT_SCAN_LIMIT, optional, rowsOf } from "./engine-reads.js"
import { buildEngineHealthData } from "./health-data.js"
import { buildHistoryTimelineData } from "./history-timeline-data.js"
import { buildIncidentDetailData } from "./incident-detail-data.js"
import { buildIncidentsDashboardData } from "./incidents-dashboard-data.js"
import { buildInstanceDetailData } from "./instance-detail-data.js"
import { buildActivityIncidentsData, buildProcessIncidentsData } from "./process-incidents-data.js"

/**
 * The honest-numbers rule (CLAUDE.md invariant 7, `engine-reads.ts`): a data
 * builder's PRIMARY rows and counts propagate engine failures — a down,
 * unauthorized or overloaded engine is a tool error, never a confident "0
 * jobs" — and an unknown id is a not-found error, never a view of zeros.
 * Only ENRICHMENT degrades, and to null.
 *
 * Each case declares only its enrichment reads; EVERY OTHER read its healthy
 * build makes (method + path + query names, `readOf`) is primary, and the
 * table breaks each of them in turn. A swallowed failure on any read — a new
 * one included — fails here without anyone remembering to list it. The
 * structural check below fails when a builder ships without a case.
 */

const engines: FakeEngine[] = []
afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.close()))
})

const urls = (baseUrl: string) => ({ baseUrl, provider: cibsevenProvider })

interface Case {
  run: (client: Client, baseUrl: string) => Promise<unknown>
  /** Replies that differ from the shared world for this case (e.g. a capped scan). */
  world?: (request: RecordedRequest) => FakeReply | undefined
  /** The lookup of the id/key the builder is asked about, answering "nothing there". */
  unknown?: { read: string; reply: FakeReply }
  /** Enrichment reads: each failure leaves the build intact, with the read's value null. */
  enrichment?: Record<string, (data: never) => unknown>
}

/** The tenant-agnostic latest-version lookup of a key (`findLatestDefinition`). */
const KEY_LOOKUP = "GET /process-definition?key&latestVersion&maxResults&sortBy&sortOrder"
const NOT_FOUND = { status: 404, body: { type: "InvalidRequestException", message: "not found" } }
const NO_ROWS = { body: [] }

/** `count` open incidents of the world's activity, all of them just now. */
function incidentScan(count: number): unknown[] {
  const now = toEngineDate(new Date())
  return Array.from({ length: count }, (_, n) => ({
    id: `inc-scan-${n}`,
    processDefinitionId: WORLD.instanceDefinitionId,
    processInstanceId: WORLD.instanceId,
    activityId: WORLD.activityId,
    incidentType: "failedJob",
    incidentMessage: "card declined",
    incidentTimestamp: now,
    configuration: WORLD.jobId,
  }))
}

const processIncidents: Case["run"] = (client, baseUrl) =>
  buildProcessIncidentsData(client, { ...urls(baseUrl), processDefinitionKey: WORLD.key })
const processIncidentsXml = {
  [`GET /process-definition/${WORLD.latestDefinitionId}/xml`]: (data: { bpmnXml: unknown }) =>
    data.bpmnXml,
}
const clusterDetail: Case["run"] = (client) =>
  buildClusterDetailData(client, "fake", {
    activityId: WORLD.activityId,
    incidentType: "failedJob",
  })
const clusterBusinessKeys = {
  "GET /process-instance?maxResults&processInstanceIds": (data: {
    incidents: Array<{ businessKey: unknown }>
  }) => data.incidents[0]?.businessKey,
}
const incidentDetailEnrichment = {
  [`GET /process-definition/${WORLD.instanceDefinitionId}`]: (data: {
    processDefinitionName: unknown
  }) => data.processDefinitionName,
  [`GET /process-definition/${WORLD.instanceDefinitionId}/xml`]: (data: { bpmnXml: unknown }) =>
    data.bpmnXml,
  "GET /history/activity-instance/count?processInstanceId": (data: {
    historyTotalCount: unknown
  }) => data.historyTotalCount,
  [`GET /job/${WORLD.jobId}/stacktrace`]: (data: { job: { stacktrace: unknown } }) =>
    data.job.stacktrace,
}

const CASES: Record<string, Case> = {
  buildCockpitDashboardData: {
    run: (client) => buildCockpitDashboardData(client, "fake"),
  },
  buildProcessListData: {
    run: (client) => buildProcessListData(client, "fake", {}),
  },
  buildProcessInstancesData: {
    run: (client) => buildProcessInstancesData(client, "fake", { processDefinitionKey: WORLD.key }),
    unknown: { read: KEY_LOOKUP, reply: NO_ROWS },
  },
  buildJobPanelData: {
    run: (client) => buildJobPanelData(client, "fake", { processDefinitionKey: WORLD.key }),
    unknown: { read: KEY_LOOKUP, reply: NO_ROWS },
  },
  buildInstanceDetailData: {
    run: (client) =>
      buildInstanceDetailData(client, "fake", { processInstanceId: WORLD.instanceId }),
    unknown: { read: `GET /process-instance/${WORLD.instanceId}`, reply: NOT_FOUND },
    enrichment: {
      [`GET /process-definition/${WORLD.instanceDefinitionId}/xml`]: (data: { bpmnXml: unknown }) =>
        data.bpmnXml,
    },
  },
  buildHistoryTimelineData: {
    run: (client) =>
      buildHistoryTimelineData(client, "fake", { processInstanceId: WORLD.instanceId }),
  },
  buildBpmnViewerData: {
    run: (client) => buildBpmnViewerData(client, "fake", { processInstanceId: WORLD.instanceId }),
    unknown: { read: `GET /process-instance/${WORLD.instanceId}`, reply: NOT_FOUND },
    enrichment: {
      [`GET /process-definition/${WORLD.instanceDefinitionId}/xml`]: (data: { bpmnXml: unknown }) =>
        data.bpmnXml,
    },
  },
  buildEngineHealthData: {
    run: (client) => buildEngineHealthData(client, "fake"),
    enrichment: {
      "GET /history/process-instance/count?startedAfter": (data: {
        summary: { started24h: unknown }
      }) => data.summary.started24h,
      "GET /history/process-instance/count?finishedAfter": (data: {
        summary: { completed24h: unknown }
      }) => data.summary.completed24h,
    },
  },
  buildClusterDetailData: { run: clusterDetail, enrichment: clusterBusinessKeys },
  // A mass failure: the scan hits its limit, so the counts come from /count.
  "buildClusterDetailData (scan capped)": {
    run: clusterDetail,
    world: (r) => (r.path === "/incident" ? { body: incidentScan(CLUSTER_SCAN_LIMIT) } : undefined),
    enrichment: clusterBusinessKeys,
  },
  buildIncidentDetailData: {
    run: (client, baseUrl) =>
      buildIncidentDetailData(client, { ...urls(baseUrl), incidentId: WORLD.incidentId }),
    unknown: { read: `GET /incident/${WORLD.incidentId}`, reply: NOT_FOUND },
    enrichment: incidentDetailEnrichment,
  },
  // The root cause decides which job and message the view shows — primary.
  "buildIncidentDetailData (delegated incident)": {
    run: (client, baseUrl) =>
      buildIncidentDetailData(client, {
        ...urls(baseUrl),
        incidentId: WORLD.delegatedIncidentId,
      }),
    unknown: { read: `GET /incident/${WORLD.delegatedIncidentId}`, reply: NOT_FOUND },
    enrichment: incidentDetailEnrichment,
  },
  buildIncidentsDashboardData: {
    run: (client, baseUrl) =>
      buildIncidentsDashboardData(client, { ...urls(baseUrl), processDefinitionKey: WORLD.key }),
    // The statistics list every deployed key: a key they lack is not deployed.
    unknown: { read: "GET /process-definition/statistics?incidents", reply: NO_ROWS },
  },
  buildProcessIncidentsData: {
    run: processIncidents,
    unknown: { read: KEY_LOOKUP, reply: NO_ROWS },
    enrichment: processIncidentsXml,
  },
  // More incidents than the scan holds: per-activity counts from the statistics.
  "buildProcessIncidentsData (scan capped)": {
    run: processIncidents,
    world: (r) =>
      r.path === "/incident" ? { body: incidentScan(INCIDENT_SCAN_LIMIT) } : undefined,
    enrichment: processIncidentsXml,
  },
  // No incidents: the empty state reads the other processes — enrichment.
  "buildProcessIncidentsData (no incidents)": {
    run: processIncidents,
    world: (r) =>
      r.path === "/incident/count"
        ? { body: { count: 0 } }
        : r.path === "/incident"
          ? NO_ROWS
          : undefined,
    enrichment: {
      ...processIncidentsXml,
      "GET /process-definition/statistics?incidents": (data: { siblingsWithIncidents: unknown }) =>
        data.siblingsWithIncidents,
    },
  },
  buildActivityIncidentsData: {
    run: (client, baseUrl) =>
      buildActivityIncidentsData(client, {
        ...urls(baseUrl),
        processDefinitionKey: WORLD.key,
        activityId: WORLD.activityId,
      }),
  },
}

/** The case's engine — the world plus its overrides, with at most one read broken. */
function engineReply(builder: Case, broken?: { read: string; reply: FakeReply }) {
  return (request: RecordedRequest): FakeReply =>
    broken && readOf(request) === broken.read
      ? broken.reply
      : (builder.world?.(request) ?? worldReply(request))
}

async function build(builder: Case, broken?: { read: string; reply: FakeReply }) {
  const engine = await startFakeEngine({}, engineReply(builder, broken))
  engines.push(engine)
  const result = builder.run(clientFor(engine), engine.baseUrl)
  // Settle before reading the recorded requests; the caller asserts the outcome.
  const outcome = await result.then(
    (data) => ({ ok: true as const, data }),
    (error: unknown) => ({ ok: false as const, error }),
  )
  return { outcome, reads: new Set(engine.requests.map(readOf)) }
}

describe.each(Object.entries(CASES))("%s", (_name, builder) => {
  const enrichment = builder.enrichment ?? {}

  it("builds from a healthy engine, reading every declared enrichment", async () => {
    const { outcome, reads } = await build(builder)
    expect(outcome.ok ? null : String(outcome.error)).toBeNull()
    // A stale declaration would exempt a read the builder no longer makes.
    expect([...reads]).toEqual(expect.arrayContaining(Object.keys(enrichment)))
    expect([...reads].filter((read) => !(read in enrichment)).length).toBeGreaterThan(0)
  })

  it("fails — never a confident 0 or [] — when ANY primary read fails", async () => {
    const { reads } = await build(builder)
    const primary = [...reads].filter((read) => !(read in enrichment))
    const broken = await Promise.all(
      primary.map(async (read) => ({
        read,
        ...(await build(builder, { read, reply: ENGINE_FAILURE })),
      })),
    )
    // Each broken read was actually made: the case pins a real dependency.
    for (const { read, reads: made } of broken) expect(made).toContain(read)
    expect(
      broken.filter(({ outcome }) => outcome.ok).map(({ read }) => read),
      "primary reads whose failure the builder swallowed",
    ).toEqual([])
  })

  it.runIf(Object.keys(enrichment).length > 0)(
    "degrades each failed enrichment read to null",
    async () => {
      const degraded = await Promise.all(
        Object.entries(enrichment).map(async ([read, value]) => ({
          read,
          value,
          ...(await build(builder, { read, reply: ENGINE_FAILURE })),
        })),
      )
      for (const { read, value, outcome } of degraded) {
        expect(outcome.ok ? null : String(outcome.error), read).toBeNull()
        if (outcome.ok) expect(value(outcome.data as never), read).toBeNull()
      }
    },
  )

  it.runIf(builder.unknown)("fails on an unknown id instead of reporting zeros", async () => {
    const { outcome, reads } = await build(builder, builder.unknown)
    expect(outcome.ok).toBe(false)
    expect(reads).toContain(builder.unknown!.read)
  })
})

describe("the rejection table is complete", () => {
  it("names every data builder exported from src/data", async () => {
    const dir = dirname(fileURLToPath(import.meta.url))
    const modules = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    const builders: string[] = []
    for (const file of modules) {
      const exports = (await import(`./${file.replace(/\.ts$/, ".js")}`)) as Record<string, unknown>
      builders.push(
        ...Object.entries(exports)
          .filter(([name, value]) => /^build[A-Z]/.test(name) && typeof value === "function")
          .map(([name]) => name),
      )
    }
    // A variant case ("buildX (scan capped)") covers the same builder.
    const covered = new Set(Object.keys(CASES).map((name) => name.split(" ")[0]))
    expect(builders.sort()).toEqual([...covered].sort())
  })
})

describe("engine-reads", () => {
  it("a count reply without a count is an engine-contract breach, not a 0", () => {
    expect(countOf({ count: 0 })).toBe(0)
    expect(() => countOf({})).toThrow(/without a count/)
    expect(() => countOf(null)).toThrow(/without a count/)
  })

  it("a list reply that is no list is an engine-contract breach, not 'no rows'", () => {
    expect(rowsOf([1])).toEqual([1])
    expect(() => rowsOf({})).toThrow(/without a list/)
    expect(() => rowsOf(undefined)).toThrow(/without a list/)
  })

  it("an enrichment read degrades to null", async () => {
    await expect(optional(Promise.reject(new Error("boom")))).resolves.toBeNull()
    await expect(optional(Promise.resolve("x"))).resolves.toBe("x")
  })
})
