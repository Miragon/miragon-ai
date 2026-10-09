import { describe, expect, it } from "vitest"
import type { IncidentDetailData } from "../../view-models.js"
import { draftTicketPrompt, explainErrorPrompt } from "./failure-tab.js"

const INCIDENT = {
  incidentId: "inc-1",
  incidentType: "failedJob",
  incidentMessage: "boom",
  activityId: "Task_1",
  activityName: "Charge card",
  processDefinitionKey: "order",
  processDefinitionName: "Order",
  processDefinitionVersion: 3,
  processInstanceId: "pi-1",
  businessKey: null,
  job: null,
} as unknown as IncidentDetailData

/**
 * The cockpit never moves the saved default engine, so a handoff about an
 * incident on another engine must carry that engine into every call template:
 * an engine-less copy routes to the default and reports "not found" (or an
 * empty list) as if it were this engine's answer.
 */
describe("incident Ask-AI prompts are scoped to the incident's engine", () => {
  const onProdB = { ...INCIDENT, engineId: "prod-b" } as IncidentDetailData

  it("the ticket draft calls the format tool on that engine", () => {
    const prompt = draftTicketPrompt(onProdB)
    expect(prompt).toContain(
      `camunda7_format_incident_issue({ engine: "prod-b", incidentId: 'inc-1' })`,
    )
    expect(prompt).toContain('Pass engine: "prod-b" on every camunda7_* call')
  })

  it("the error explanation reads the trace from that engine", () => {
    const prompt = explainErrorPrompt(onProdB)
    expect(prompt).toContain(
      'camunda7_incident_detail_data({ engine: "prod-b", incidentId: "inc-1" })',
    )
    expect(prompt).toContain('Pass engine: "prod-b" on every camunda7_* call')
  })

  it("adds no engine argument when the engine is unknown (the default routed the view)", () => {
    expect(explainErrorPrompt(INCIDENT)).toContain(
      'camunda7_incident_detail_data({ incidentId: "inc-1" })',
    )
    expect(draftTicketPrompt(INCIDENT)).not.toContain("Pass engine")
  })
})
