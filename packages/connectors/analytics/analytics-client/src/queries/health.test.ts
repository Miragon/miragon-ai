import { describe, expect, it, vi } from "vitest"
import { ENGINE_HEALTH_STATUS_RULE, engineHealth } from "./health.js"
import type { PrometheusClient, PromSample } from "../prometheus.js"

const sample = (metric: Record<string, string>, value: number): PromSample => ({ metric, value })

interface Fixture {
  running?: PromSample[]
  incidents?: PromSample[]
  dead?: number
  firing?: PromSample[]
  pending?: PromSample[]
}

/** Answers each gauge by its metric name; ALERTS by its alertstate. */
function mockClient(fixture: Fixture = {}) {
  const scalar = (value: number | undefined) => (value === undefined ? [] : [sample({}, value)])
  const instant = vi.fn(async (q: string): Promise<PromSample[]> => {
    if (q.startsWith("ALERTS")) {
      return (q.includes('"firing"') ? fixture.firing : fixture.pending) ?? []
    }
    if (q.includes("process_instances_running")) return fixture.running ?? []
    if (q.includes("incidents_open")) return fixture.incidents ?? []
    if (q.includes("jobs_failed")) return scalar(fixture.dead)
    if (q.includes("jobs_executable")) return scalar(12.4)
    if (q.includes("jobs_suspended")) return scalar(2)
    if (q.includes('status="total"')) return scalar(9)
    if (q.includes('status="unassigned"')) return scalar(4)
    if (q.includes("external_tasks_open")) return scalar(6.6)
    if (q.includes("process_definitions_deployed")) return scalar(3)
    return []
  })
  const ch: PrometheusClient = { instant }
  return { ch, instant }
}

const alert = (alertname: string, severity: string, scope: Record<string, string> = {}) =>
  sample({ alertname, severity, ...scope }, 1)

describe("engineHealth snapshot", () => {
  it("reports every gauge, rounded, with breakdowns sorted and zero rows dropped", async () => {
    const { ch } = mockClient({
      running: [
        sample({ process_definition_key: "invoice" }, 2),
        sample({ process_definition_key: "order" }, 7.4),
        sample({ process_definition_key: "idle" }, 0.2),
        sample({}, 1),
      ],
      incidents: [sample({ incident_type: "failedJob" }, 3)],
      dead: 1.6,
    })
    const result = await engineHealth(ch, {})
    expect(result).toMatchObject({
      runningInstances: 10,
      runningByDefinition: [
        { label: "order", count: 7 },
        { label: "invoice", count: 2 },
        { label: "", count: 1 },
      ],
      openIncidents: 3,
      openIncidentsByType: [{ label: "failedJob", count: 3 }],
      deadJobs: 2,
      executableJobs: 12,
      suspendedJobs: 2,
      openUserTasks: 9,
      unassignedUserTasks: 4,
      openExternalTasks: 7,
      deployedDefinitionKeys: 3,
    })
  })

  it("names each alert's scope by process, else incident type, else engine", async () => {
    const { ch } = mockClient({
      firing: [
        alert("A", "warning", { process_definition_key: "order", incident_type: "x" }),
        alert("B", "warning", { incident_type: "failedJob", engine_id: "prod-a" }),
        alert("C", "warning", { engine_id: "prod-a" }),
        sample({}, 1),
      ],
      pending: [alert("D", "info")],
    })
    const result = await engineHealth(ch, {})
    expect(result.firingAlerts).toEqual([
      { name: "A", severity: "warning", scope: "order" },
      { name: "B", severity: "warning", scope: "failedJob" },
      { name: "C", severity: "warning", scope: "prod-a" },
      { name: "", severity: "", scope: "" },
    ])
    expect(result.pendingAlerts).toEqual([{ name: "D", severity: "info", scope: "" }])
  })

  it("reads zero for a gauge without samples", async () => {
    const instant = vi.fn(async (): Promise<PromSample[]> => [])
    const result = await engineHealth({ instant }, {})
    expect(result).toMatchObject({
      runningInstances: 0,
      openIncidents: 0,
      deadJobs: 0,
      executableJobs: 0,
      firingAlerts: [],
    })
  })
})

/**
 * #340: the verdict is alert-based and says so — the same engine may be
 * "critical" in camunda7_show_engine_health (incident counts) and only
 * "degraded" here.
 */
describe("engineHealth verdict", () => {
  it.each<[string, Fixture, string]>([
    ["no signal at all", {}, "healthy"],
    ["one open incident", { incidents: [sample({ incident_type: "failedJob" }, 1)] }, "degraded"],
    ["one dead job", { dead: 1 }, "degraded"],
    ["a firing warning", { firing: [alert("Slow", "warning")] }, "degraded"],
    ["a firing critical alert", { firing: [alert("NoMetrics", "critical")] }, "critical"],
    ["a merely PENDING critical alert", { pending: [alert("NoMetrics", "critical")] }, "healthy"],
    [
      "500 open incidents without a critical alert",
      { incidents: [sample({ incident_type: "failedJob" }, 500)] },
      "degraded",
    ],
  ])("%s → %s", async (_label, fixture, status) => {
    const result = await engineHealth(mockClient(fixture).ch, {})
    expect(result.status).toBe(status)
    expect(result.statusRule).toBe(ENGINE_HEALTH_STATUS_RULE)
  })

  it("states its rule in words", () => {
    expect(ENGINE_HEALTH_STATUS_RULE).toBe(
      "From Prometheus: critical only while an alert rule with severity=critical fires; degraded with any firing alert, dead job or open incident; else healthy.",
    )
  })
})

describe("engineHealth PromQL", () => {
  it("scopes every gauge and the ALERTS series to the engine filter", async () => {
    const { ch, instant } = mockClient()
    await engineHealth(ch, { engine: "prod-a" })
    const sel = '{engine_id="prod-a"}'
    expect(instant.mock.calls.map(([q]) => q)).toEqual([
      `camunda_process_instances_running${sel}`,
      `sum by (incident_type)(camunda_incidents_open${sel})`,
      `sum(camunda_jobs_failed${sel})`,
      `sum(camunda_jobs_executable${sel})`,
      `sum(camunda_jobs_suspended${sel})`,
      `sum(camunda_usertasks_open{status="total",engine_id="prod-a"})`,
      `sum(camunda_usertasks_open{status="unassigned",engine_id="prod-a"})`,
      `sum(camunda_external_tasks_open${sel})`,
      `count(camunda_process_definitions_deployed${sel})`,
      `ALERTS{alertstate="firing",engine_id="prod-a"}`,
      `ALERTS{alertstate="pending",engine_id="prod-a"}`,
    ])
  })
})
