import { readdirSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import type { Client } from "@miragon-ai/camunda7-client"
import { cibsevenProvider } from "../providers/index.js"
import { clientFor, startFakeEngine, type FakeEngine } from "../tools/test-support/fake-engine.js"
import { withFailure, WORLD, worldReply } from "../tools/test-support/engine-world.js"
import { buildBpmnViewerData } from "./bpmn-viewer-data.js"
import {
  buildCockpitDashboardData,
  buildJobPanelData,
  buildProcessInstancesData,
  buildProcessListData,
} from "./cockpit-data.js"
import { countOf, optional, rowsOf } from "./engine-reads.js"
import { buildClusterDetailData, buildEngineHealthData } from "./health-data.js"
import { buildHistoryTimelineData } from "./history-timeline-data.js"
import { buildIncidentDetailData } from "./incident-detail-data.js"
import { buildIncidentsDashboardData } from "./incidents-dashboard-data.js"
import { buildInstanceDetailData } from "./instance-detail-data.js"
import { buildActivityIncidentsData, buildProcessIncidentsData } from "./process-incidents-data.js"

/**
 * The honest-numbers rule (CLAUDE.md invariant 7, `engine-reads.ts`): a data
 * builder's PRIMARY rows and counts propagate engine failures — a down,
 * unauthorized or overloaded engine is a tool error, never a confident "0
 * jobs" — and an unknown id is the engine's not-found, never a view of zeros.
 * Only ENRICHMENT degrades, and to null. One case per builder, against a
 * healthy engine with exactly ONE route broken; the structural check below
 * fails when a new builder ships without its case.
 */

const engines: FakeEngine[] = []
afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.close()))
})

type Route = Parameters<typeof withFailure>[0]
const urls = (baseUrl: string) => ({ baseUrl, provider: cibsevenProvider })

interface Case {
  run: (client: Client, baseUrl: string) => Promise<unknown>
  /** A primary read: its failure fails the build. */
  primary: Route
  /** The lookup of the id/key the builder is asked about: its 404 fails the build. */
  unknown?: Route
  /** An enrichment read: its failure leaves the build intact, with `read(data)` null. */
  enrichment?: { route: Route; read: (data: never) => unknown }
}

const KEY_LOOKUP = `GET /process-definition/key/${WORLD.key}`
const INSTANCE = `GET /process-instance/${WORLD.instanceId}`

const CASES: Record<string, Case> = {
  buildCockpitDashboardData: {
    run: (client) => buildCockpitDashboardData(client, "fake"),
    primary: "GET /process-definition/statistics",
  },
  buildProcessListData: {
    run: (client) => buildProcessListData(client, "fake", {}),
    primary: "GET /process-definition/count",
  },
  buildProcessInstancesData: {
    run: (client) => buildProcessInstancesData(client, "fake", { processDefinitionKey: WORLD.key }),
    primary: "GET /process-instance/count",
    unknown: KEY_LOOKUP,
  },
  buildJobPanelData: {
    run: (client) => buildJobPanelData(client, "fake", { processDefinitionKey: WORLD.key }),
    primary: "GET /job/count",
    unknown: KEY_LOOKUP,
  },
  buildInstanceDetailData: {
    run: (client) =>
      buildInstanceDetailData(client, "fake", { processInstanceId: WORLD.instanceId }),
    primary: "GET /incident/count",
    unknown: INSTANCE,
    enrichment: {
      route: `GET /process-definition/${WORLD.instanceDefinitionId}/xml`,
      read: (data: { bpmnXml: unknown }) => data.bpmnXml,
    },
  },
  buildHistoryTimelineData: {
    run: (client) =>
      buildHistoryTimelineData(client, "fake", { processInstanceId: WORLD.instanceId }),
    primary: "GET /history/activity-instance/count",
  },
  buildBpmnViewerData: {
    run: (client) => buildBpmnViewerData(client, "fake", { processInstanceId: WORLD.instanceId }),
    primary: "GET /job",
    unknown: INSTANCE,
    enrichment: {
      route: `GET /process-definition/${WORLD.instanceDefinitionId}/xml`,
      read: (data: { bpmnXml: unknown }) => data.bpmnXml,
    },
  },
  buildEngineHealthData: {
    run: (client) => buildEngineHealthData(client, "fake"),
    primary: "GET /incident/count",
    enrichment: {
      route: "GET /history/process-instance/count",
      read: (data: { summary: { started24h: unknown } }) => data.summary.started24h,
    },
  },
  buildClusterDetailData: {
    run: (client) =>
      buildClusterDetailData(client, "fake", {
        activityId: WORLD.activityId,
        incidentType: "failedJob",
      }),
    primary: "GET /incident",
  },
  buildIncidentDetailData: {
    run: (client, baseUrl) =>
      buildIncidentDetailData(client, { ...urls(baseUrl), incidentId: WORLD.incidentId }),
    primary: "GET /job",
    unknown: `GET /incident/${WORLD.incidentId}`,
    enrichment: {
      route: `GET /process-definition/${WORLD.instanceDefinitionId}`,
      read: (data: { processDefinitionName: unknown }) => data.processDefinitionName,
    },
  },
  buildIncidentsDashboardData: {
    run: (client, baseUrl) => buildIncidentsDashboardData(client, urls(baseUrl)),
    primary: "GET /process-definition/statistics",
  },
  buildProcessIncidentsData: {
    run: (client, baseUrl) =>
      buildProcessIncidentsData(client, { ...urls(baseUrl), processDefinitionKey: WORLD.key }),
    primary: "GET /job/count",
    unknown: KEY_LOOKUP,
    enrichment: {
      route: `GET /process-definition/key/${WORLD.key}/xml`,
      read: (data: { bpmnXml: unknown }) => data.bpmnXml,
    },
  },
  buildActivityIncidentsData: {
    run: (client, baseUrl) =>
      buildActivityIncidentsData(client, {
        ...urls(baseUrl),
        processDefinitionKey: WORLD.key,
        activityId: WORLD.activityId,
      }),
    primary: "GET /incident/count",
  },
}

async function build(builder: Case, engineReply: Parameters<typeof startFakeEngine>[1]) {
  const engine = await startFakeEngine({}, engineReply)
  engines.push(engine)
  return { result: builder.run(clientFor(engine), engine.baseUrl), engine }
}

const NOT_FOUND = { status: 404, body: { type: "InvalidRequestException", message: "not found" } }

describe.each(Object.entries(CASES))("%s", (_name, builder) => {
  it("builds from a healthy engine (the cases below break exactly one route)", async () => {
    const { result } = await build(builder, worldReply)
    await expect(result).resolves.toBeDefined()
  })

  it("fails — never a confident 0 or [] — when a primary read fails", async () => {
    const { result, engine } = await build(builder, withFailure(builder.primary))
    await expect(result).rejects.toThrow()
    // The broken route was actually read: the case pins a real dependency.
    expect(engine.requests.map((r) => `${r.method} ${r.path}`)).toContain(builder.primary)
  })

  it.runIf(builder.unknown)("fails on an unknown id instead of reporting zeros", async () => {
    const { result } = await build(builder, withFailure(builder.unknown!, NOT_FOUND))
    await expect(result).rejects.toThrow()
  })

  it.runIf(builder.enrichment)("degrades a failed enrichment read to null", async () => {
    const { route, read } = builder.enrichment!
    const { result } = await build(builder, withFailure(route))
    expect(read((await result) as never)).toBeNull()
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
    expect(builders.sort()).toEqual(Object.keys(CASES).sort())
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
