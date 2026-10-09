import { afterEach, describe, expect, it } from "vitest"
import { resolveEngine } from "../lib/resolve-engine.js"
import { cibsevenProvider } from "../providers/index.js"
import {
  registryFor,
  startFakeEngine,
  type FakeEngine,
  type FakeRoutes,
} from "../tools/test-support/fake-engine.js"
import { buildIncidentDetailData } from "./incident-detail-data.js"

/**
 * The incident-detail feed reads through the engine contract (#328): the
 * stacktrace as text/plain, the variables serialized, and the remedy the
 * engine accepts — a retry for the built-in incident types, resolve only for
 * custom ones. A real loopback engine sees the requests as sent.
 */

const engines: FakeEngine[] = []
afterEach(async () => {
  await Promise.all(engines.splice(0).map((engine) => engine.close()))
})

const STACK = "java.lang.IllegalStateException: boom\n\tat com.acme.Billing.charge(Billing.java:42)"

const incident = (over: Record<string, unknown>) => ({
  id: "inc-1",
  processDefinitionId: "def-1",
  processInstanceId: "pi-1",
  activityId: "charge",
  incidentType: "failedJob",
  incidentMessage: "boom",
  incidentTimestamp: "2026-10-09T09:30:00.000+0000",
  configuration: "job-1",
  ...over,
})

async function build(routes: FakeRoutes) {
  // Optional lookups the routes leave out answer 404 and degrade.
  const engine = await startFakeEngine(routes, { status: 404, body: { message: "not here" } })
  engines.push(engine)
  const { client } = await resolveEngine(undefined, registryFor(engine))
  const data = await buildIncidentDetailData(client, {
    baseUrl: engine.baseUrl,
    provider: cibsevenProvider,
    incidentId: "inc-1",
  })
  return { data, engine }
}

describe("buildIncidentDetailData through the engine contract", () => {
  it("offers a job retry for a failedJob and reads its stacktrace as text/plain", async () => {
    const { data, engine } = await build({
      "GET /incident/inc-1": { body: incident({}) },
      "GET /job": { body: [{ id: "job-1", retries: 0, exceptionMessage: "boom" }] },
      "GET /job/job-1/stacktrace": { contentType: "text/plain", body: STACK },
      "GET /process-instance/pi-1/variables": {
        body: { payload: { type: "Json", value: '{"a":1}', valueInfo: {} } },
      },
    })
    expect(data.recovery).toEqual({ action: "retry-job", jobId: "job-1" })
    expect(data.job).toMatchObject({ id: "job-1", retries: 0, stacktrace: STACK })
    expect(data.variables).toEqual({ payload: { type: "Json", value: '{"a":1}', valueInfo: {} } })
    const byPath = new Map(engine.requests.map((r) => [r.path, r]))
    expect(byPath.get("/job/job-1/stacktrace")?.headers.accept).toBe("text/plain")
    expect(byPath.get("/process-instance/pi-1/variables")?.query).toEqual({
      deserializeValues: "false",
    })
  })

  it("keeps the failure tab without a stacktrace when the engine has none", async () => {
    const { data } = await build({
      "GET /incident/inc-1": { body: incident({}) },
      "GET /job": { body: [{ id: "job-1", retries: 0 }] },
    })
    expect(data.job).toMatchObject({ id: "job-1", stacktrace: null })
  })

  it("offers an external-task retry for a failedExternalTask (no job)", async () => {
    const { data } = await build({
      "GET /incident/inc-1": {
        body: incident({ incidentType: "failedExternalTask", configuration: "ext-1" }),
      },
    })
    expect(data.recovery).toEqual({ action: "retry-external-task", externalTaskId: "ext-1" })
    expect(data.job).toBeNull()
  })

  it("takes a delegated incident's failure target from its root cause", async () => {
    const { data } = await build({
      "GET /incident/inc-1": {
        body: incident({ configuration: null, incidentMessage: null, rootCauseIncidentId: "root" }),
      },
      "GET /incident/root": {
        body: incident({ id: "root", configuration: "job-9", incidentMessage: "deep boom" }),
      },
      "GET /job": { body: [{ id: "job-9", retries: 0 }] },
    })
    expect(data.recovery).toEqual({ action: "retry-job", jobId: "job-9" })
    expect(data.incidentMessage).toBe("deep boom")
    expect(data.job?.id).toBe("job-9")
  })

  it("resolves only a custom incident", async () => {
    const { data } = await build({
      "GET /incident/inc-1": { body: incident({ incidentType: "invoiceMismatch" }) },
    })
    expect(data.recovery).toEqual({ action: "resolve" })
    expect(data.job).toBeNull()
  })
})
