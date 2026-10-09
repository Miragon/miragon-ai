import { afterEach, describe, expect, it } from "vitest"
import type { z } from "zod"
import { registerTools } from "./index.js"
import { registerIncidentIssueTools } from "./incident-issue.js"
import {
  callTool,
  captureTools,
  registryFor,
  startFakeEngine,
  type FakeEngine,
  type FakeReply,
  type FakeRoutes,
} from "./test-support/fake-engine.js"

/**
 * Guard for #328, read side: the engine-contract rules every READ tool must
 * honour on the wire — paired sorting, engine dates, raw (non-deserialized)
 * variable reads, text/plain endpoints, and errors that are not swallowed
 * into a plausible-looking empty result.
 */

const tools = captureTools(
  (register) => registerTools(register, { allowDeployments: true }),
  (register) => registerIncidentIssueTools(register, {}),
)

const engines: FakeEngine[] = []
afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.close()))
})

async function engineWith(routes?: FakeRoutes, fallback?: FakeReply) {
  const engine = await startFakeEngine(routes, fallback)
  engines.push(engine)
  return engine
}

function call(engine: FakeEngine, name: string, args: Record<string, unknown>) {
  const config = tools.get(name)
  if (!config) throw new Error(`${name} is not registered`)
  return callTool(config, registryFor(engine), args)
}

/** Every list tool that exposes sorting, with the first sort field it offers. */
const SORTED_TOOLS = [...tools.values()].flatMap((config) => {
  const sortBy = (config.inputSchema as Record<string, z.ZodType>).sortBy
  if (!sortBy) return []
  const field = (sortBy as unknown as z.ZodOptional<z.ZodEnum>).unwrap().options[0]
  return [{ name: config.name, field: String(field) }]
})

describe("sortBy/sortOrder are sent as the pair the engine requires", () => {
  it("covers every sortable list tool (the guard is not vacuous)", () => {
    expect(SORTED_TOOLS.length).toBeGreaterThanOrEqual(11)
  })

  it.each(SORTED_TOOLS)("$name: sortBy alone sorts ascending", async ({ name, field }) => {
    const engine = await engineWith({}, { body: [] })
    await call(engine, name, { sortBy: field })
    const sorted = engine.requests.filter((r) => "sortBy" in r.query)
    expect(sorted).toHaveLength(1)
    expect(sorted[0].query).toMatchObject({ sortBy: field, sortOrder: "asc" })
    // The /count twin never sorts.
    expect(engine.requests.filter((r) => r.path.endsWith("/count") && "sortBy" in r.query)).toEqual(
      [],
    )
  })

  it.each(SORTED_TOOLS)("$name: a lone sortOrder is dropped", async ({ name }) => {
    const engine = await engineWith({}, { body: [] })
    await call(engine, name, { sortOrder: "desc" })
    expect(engine.requests.some((r) => "sortOrder" in r.query || "sortBy" in r.query)).toBe(false)
  })
})

describe("history date filters take ISO 8601 and reach the engine in its format", () => {
  it("converts startedAfter/startedBefore", async () => {
    const engine = await engineWith({}, { body: [] })
    await call(engine, "camunda7_query_historic_process_instances", {
      startedAfter: "2026-10-01T00:00:00Z",
      startedBefore: "2026-10-02",
    })
    for (const request of engine.requests) {
      expect(request.query).toMatchObject({
        startedAfter: "2026-10-01T00:00:00.000+0000",
        startedBefore: "2026-10-02T00:00:00.000+0000",
      })
    }
    expect(engine.requests).toHaveLength(2)
  })

  it("refuses an unparseable date before any request", async () => {
    const engine = await engineWith()
    expect(() =>
      call(engine, "camunda7_query_historic_process_instances", { startedAfter: "yesterday" }),
    ).toThrow(/ISO 8601/)
    expect(engine.requests).toHaveLength(0)
  })
})

describe("variable reads never let the engine deserialize Object values", () => {
  it.each([
    [
      "camunda7_get_process_instance_variables",
      { processInstanceId: "pi-1" },
      "/process-instance/pi-1/variables",
    ],
    ["camunda7_get_task_variables", { taskId: "t-1" }, "/task/t-1/variables"],
    ["camunda7_query_historic_variable_instances", {}, "/history/variable-instance"],
  ])("%s sends deserializeValues=false", async (name, args, path) => {
    const engine = await engineWith({}, { body: {} })
    await call(engine, name, args)
    expect(engine.requests.find((r) => r.path === path)?.query).toMatchObject({
      deserializeValues: "false",
    })
  })
})

describe("camunda7_list_tasks candidate groups", () => {
  it("forwards includeAssignedTasks with candidateGroup — list AND count", async () => {
    const engine = await engineWith({}, { body: [] })
    await call(engine, "camunda7_list_tasks", { candidateGroup: "ops", includeAssignedTasks: true })
    expect(engine.requests.map((r) => r.query.includeAssignedTasks)).toEqual(["true", "true"])
  })

  it("drops includeAssignedTasks without candidateGroup (the engine refuses it alone)", async () => {
    const engine = await engineWith({}, { body: [] })
    await call(engine, "camunda7_list_tasks", { includeAssignedTasks: true })
    expect(engine.requests.some((r) => "includeAssignedTasks" in r.query)).toBe(false)
  })

  it("tells the model a candidate group lists only unassigned tasks by default", () => {
    const schema = tools.get("camunda7_list_tasks")?.inputSchema as Record<string, z.ZodType>
    expect(schema.candidateGroup.description).toContain("only UNASSIGNED ones")
  })
})

describe("camunda7_get_batch", () => {
  it("reports a running batch from its statistics", async () => {
    const engine = await engineWith({
      "GET /batch/statistics": {
        body: [
          { id: "b-1", type: "set-job-retries", totalJobs: 2, remainingJobs: 2, failedJobs: 0 },
        ],
      },
    })
    expect(await call(engine, "camunda7_get_batch", { batchId: "b-1" })).toMatchObject({
      batchId: "b-1",
      status: "running",
      remainingJobs: 2,
    })
    expect(engine.requests[0].query).toEqual({ batchId: "b-1" })
  })

  it("falls back to the batch history once the batch has ended", async () => {
    const engine = await engineWith({
      "GET /batch/statistics": { body: [] },
      "GET /history/batch/b-1": { body: { id: "b-1", endTime: "2026-10-09T09:30:45.684+0000" } },
    })
    expect(await call(engine, "camunda7_get_batch", { batchId: "b-1" })).toMatchObject({
      status: "completed",
    })
  })
})
