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
  type RecordedRequest,
} from "./test-support/fake-engine.js"

/**
 * Guard for #329: every filter a tool advertises must REACH the engine, under
 * the engine's own name and encoding — on the page query AND its /count twin
 * (else the total contradicts the page). Before, an undeclared filter was
 * stripped silently and a declared one could still be a no-op on the engine
 * side (a `false` flag, a LIKE value without `%`), so the "filtered" answer
 * was engine-wide.
 */

const tools = captureTools(
  (register) => registerTools(register, { allowDeployments: true }),
  (register) => registerIncidentIssueTools(register, {}),
)

const engines: FakeEngine[] = []
afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.close()))
})

/** Calls `name` against a fresh recording engine that answers every list with []. */
async function requestsOf(name: string, args: Record<string, unknown>) {
  const engine = await startFakeEngine({}, { body: [] })
  engines.push(engine)
  const config = tools.get(name)
  if (!config) throw new Error(`${name} is not registered`)
  await callTool(config, registryFor(engine), args)
  return engine.requests
}

/** The page query and its /count twin both carry `expected`. */
function expectBothQueries(requests: RecordedRequest[], path: string, expected: object) {
  expect(requests.map((r) => r.path).sort()).toEqual([path, `${path}/count`])
  for (const request of requests) expect(request.query).toMatchObject(expected)
}

describe("camunda7_list_incidents scopes to a process, an activity and a time window", () => {
  it("sends processDefinitionKey as the engine's processDefinitionKeyIn", async () => {
    const requests = await requestsOf("camunda7_list_incidents", {
      processDefinitionKey: "invoice",
    })
    expectBothQueries(requests, "/incident", { processDefinitionKeyIn: "invoice" })
  })

  it("merges processDefinitionKey and processDefinitionKeyIn into one comma list", async () => {
    const requests = await requestsOf("camunda7_list_incidents", {
      processDefinitionKey: "invoice",
      processDefinitionKeyIn: ["order", "invoice"],
    })
    expectBothQueries(requests, "/incident", { processDefinitionKeyIn: "invoice,order" })
  })

  it("forwards activityId and converts the incident timestamps", async () => {
    const requests = await requestsOf("camunda7_list_incidents", {
      activityId: "ServiceTask_1",
      incidentTimestampAfter: "2026-10-01T00:00:00Z",
      incidentTimestampBefore: "2026-10-02",
    })
    expectBothQueries(requests, "/incident", {
      activityId: "ServiceTask_1",
      incidentTimestampAfter: "2026-10-01T00:00:00.000+0000",
      incidentTimestampBefore: "2026-10-02T00:00:00.000+0000",
    })
  })
})

describe("camunda7_query_historic_activity_instances", () => {
  it("filters by definition, activity, cancellation and time window", async () => {
    const requests = await requestsOf("camunda7_query_historic_activity_instances", {
      processDefinitionId: "invoice:3:abc",
      activityId: "UserTask_Approve",
      canceled: true,
      startedAfter: "2026-10-01",
      startedBefore: "2026-10-03",
      finishedAfter: "2026-10-01T12:00:00+02:00",
      finishedBefore: "2026-10-04",
    })
    expectBothQueries(requests, "/history/activity-instance", {
      processDefinitionId: "invoice:3:abc",
      activityId: "UserTask_Approve",
      canceled: "true",
      startedAfter: "2026-10-01T00:00:00.000+0000",
      startedBefore: "2026-10-03T00:00:00.000+0000",
      finishedAfter: "2026-10-01T12:00:00.000+0200",
      finishedBefore: "2026-10-04T00:00:00.000+0000",
    })
  })
})

describe("camunda7_query_historic_process_instances", () => {
  it("filters by instance, business key, incidents and finish window", async () => {
    const requests = await requestsOf("camunda7_query_historic_process_instances", {
      processInstanceId: "pi-1",
      businessKey: "ORDER-1",
      businessKeyLike: "ORDER",
      withIncidents: true,
      incidentStatus: "open",
      finishedAfter: "2026-10-01",
      finishedBefore: "2026-10-02",
    })
    expectBothQueries(requests, "/history/process-instance", {
      processInstanceId: "pi-1",
      processInstanceBusinessKey: "ORDER-1",
      processInstanceBusinessKeyLike: "%ORDER%",
      withIncidents: "true",
      incidentStatus: "open",
      finishedAfter: "2026-10-01T00:00:00.000+0000",
      finishedBefore: "2026-10-02T00:00:00.000+0000",
    })
  })
})

describe("camunda7_query_historic_task_instances", () => {
  it("takes `assignee` like camunda7_list_tasks and sends the engine's taskAssignee", async () => {
    const requests = await requestsOf("camunda7_query_historic_task_instances", {
      assignee: "demo",
    })
    expectBothQueries(requests, "/history/task", { taskAssignee: "demo" })
  })
})

describe("plain list tools carry their show twins' filters", () => {
  it("camunda7_list_process_instances: withIncidents + businessKeyLike", async () => {
    const requests = await requestsOf("camunda7_list_process_instances", {
      withIncidents: true,
      businessKeyLike: "ORDER",
    })
    expectBothQueries(requests, "/process-instance", {
      withIncident: "true",
      businessKeyLike: "%ORDER%",
    })
  })

  it("camunda7_list_process_definitions: processDefinitionKey + a substring nameLike", async () => {
    const requests = await requestsOf("camunda7_list_process_definitions", {
      processDefinitionKey: "invoice",
      nameLike: "Inv",
      latestVersion: true,
    })
    expect(requests).toHaveLength(1)
    expect(requests[0].path).toBe("/process-definition")
    expect(requests[0].query).toMatchObject({
      key: "invoice",
      nameLike: "%Inv%",
      latestVersion: "true",
    })
  })

  it("keeps a LIKE value that already carries a wildcard", async () => {
    const requests = await requestsOf("camunda7_list_deployments", { nameLike: "release-%" })
    expect(requests[0].query).toMatchObject({ nameLike: "release-%" })
  })

  it("camunda7_list_jobs: activityId scopes a failure cluster's retry set", async () => {
    const requests = await requestsOf("camunda7_list_jobs", {
      processDefinitionKey: "invoice",
      activityId: "ServiceTask_1",
      noRetriesLeft: true,
    })
    expectBothQueries(requests, "/job", {
      processDefinitionKey: "invoice",
      activityId: "ServiceTask_1",
      noRetriesLeft: "true",
    })
  })

  it("camunda7_query_historic_variable_instances: a substring variableNameLike", async () => {
    const requests = await requestsOf("camunda7_query_historic_variable_instances", {
      variableNameLike: "amount",
    })
    expectBothQueries(requests, "/history/variable-instance", { variableNameLike: "%amount%" })
  })

  it("camunda7_get_deployment takes deploymentId", async () => {
    const requests = await requestsOf("camunda7_get_deployment", { deploymentId: "dep-1" })
    expect(requests.map((r) => r.path)).toEqual(["/deployment/dep-1"])
  })
})

/**
 * The engine IGNORES a `false` boolean filter (HTTP 200, unfiltered) — it
 * neither negates nor rejects it. No list tool may forward one: a `false` is
 * either sent as the complementary flag or not at all.
 */
describe("false boolean filters never reach the engine", () => {
  // The list/query tools: their booleans are engine query FILTERS (a write's
  // body flag such as updateEventTriggers=false is an explicit value).
  const FLAG_TOOLS = [...tools.values()].flatMap((config) => {
    const shape = (config.inputSchema ?? {}) as Record<string, z.ZodType>
    if (!/^camunda7_(list|query)_/.test(config.name)) return []
    const flags = Object.entries(shape)
      .filter(([, schema]) => schema.def.type === "optional" && isBoolean(schema))
      .map(([key]) => key)
    return flags.length > 0 ? [{ name: config.name, flags }] : []
  })

  it("covers every read tool with a boolean filter (the guard is not vacuous)", () => {
    expect(FLAG_TOOLS.map((t) => t.name).sort()).toEqual([
      "camunda7_list_external_tasks",
      "camunda7_list_jobs",
      "camunda7_list_process_definitions",
      "camunda7_list_process_instances",
      "camunda7_list_tasks",
      "camunda7_query_historic_activity_instances",
      "camunda7_query_historic_process_instances",
      "camunda7_query_historic_task_instances",
    ])
  })

  it.each(FLAG_TOOLS)("$name sends no `=false` filter", async ({ name, flags }) => {
    for (const flag of flags) {
      const requests = await requestsOf(name, { [flag]: false })
      expect(requests.length).toBeGreaterThan(0)
      for (const request of requests) {
        const sentFalse = Object.entries(request.query).filter(([, value]) => value === "false")
        expect(sentFalse, `${name} {${flag}: false} → ${request.path}`).toEqual([])
      }
    }
  })

  it.each([
    ["camunda7_list_process_instances", "suspended", "/process-instance", { active: "true" }],
    ["camunda7_list_process_instances", "active", "/process-instance", { suspended: "true" }],
    ["camunda7_list_jobs", "noRetriesLeft", "/job", { withRetriesLeft: "true" }],
    ["camunda7_list_jobs", "suspended", "/job", { active: "true" }],
    ["camunda7_list_external_tasks", "locked", "/external-task", { notLocked: "true" }],
    ["camunda7_list_tasks", "unassigned", "/task", { assigned: "true" }],
    [
      "camunda7_query_historic_process_instances",
      "finished",
      "/history/process-instance",
      { unfinished: "true" },
    ],
  ] as const)("%s {%s: false} asks for the complement", async (name, flag, path, expected) => {
    const requests = await requestsOf(name, { [flag]: false })
    expectBothQueries(requests, path, expected)
    for (const request of requests) expect(request.query).not.toHaveProperty(flag)
  })
})

/**
 * A complementary pair that asks for both states or neither has no honest
 * engine answer: active/suspended and withRetriesLeft/noRetriesLeft set ONE
 * engine field, so the engine keeps the flag it applies last and returns one
 * state as if it were the filtered result; the other pairs return nothing.
 * The tool refuses the contradiction before any request.
 */
describe("a contradictory flag pair is refused, not answered", () => {
  it.each([
    ["camunda7_list_process_instances", "active", "suspended"],
    ["camunda7_list_jobs", "active", "suspended"],
    ["camunda7_list_jobs", "withRetriesLeft", "noRetriesLeft"],
    ["camunda7_list_external_tasks", "withRetriesLeft", "noRetriesLeft"],
    ["camunda7_list_external_tasks", "locked", "notLocked"],
    ["camunda7_query_historic_process_instances", "finished", "unfinished"],
    ["camunda7_query_historic_activity_instances", "finished", "unfinished"],
    ["camunda7_query_historic_task_instances", "finished", "unfinished"],
  ] as const)("%s {%s, %s}: both false or both true", async (name, first, second) => {
    const config = tools.get(name)
    if (!config) throw new Error(`${name} is not registered`)
    for (const value of [false, true]) {
      const engine = await startFakeEngine({}, { body: [] })
      engines.push(engine)
      await expect(
        callTool(config, registryFor(engine), { [first]: value, [second]: value }),
      ).rejects.toThrow(`${first}: ${value} and ${second}: ${value} contradict each other`)
      expect(engine.requests).toHaveLength(0)
    }
  })
})

function isBoolean(schema: z.ZodType): boolean {
  const inner = (schema as unknown as { unwrap: () => z.ZodType }).unwrap()
  return inner.def.type === "boolean"
}

describe("strict input — an unknown filter is refused, not dropped", () => {
  it("rejects a misnamed filter before any request", async () => {
    const engine = await startFakeEngine()
    engines.push(engine)
    const config = tools.get("camunda7_query_historic_task_instances")
    if (!config) throw new Error("not registered")
    expect(() => callTool(config, registryFor(engine), { taskAssignee: "demo" })).toThrow(
      /taskAssignee/,
    )
    expect(engine.requests).toHaveLength(0)
  })
})
