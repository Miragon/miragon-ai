import { describe, expect, it } from "vitest"
import { buildIncidentIssuePayload } from "./incident-issue.js"

describe("buildIncidentIssuePayload", () => {
  const baseIncident = {
    id: "inc-1",
    incidentType: "failedJob",
    incidentMessage: "Boom: NullPointerException at line 42",
    failedActivityId: "ServiceTask_send_invoice",
    activityId: "ServiceTask_send_invoice",
    processDefinitionId: "invoice:1:abc",
    processInstanceId: "pi-42",
    incidentTimestamp: "2026-04-27T10:11:12.000+0200",
    rootCauseIncidentId: "inc-1",
    tenantId: null,
  }

  const baseDefinition = { key: "invoice", version: 7 }

  it("produces a deterministic title and body that mirrors the bug-report template sections", () => {
    const result = buildIncidentIssuePayload({
      incident: baseIncident,
      processDefinition: baseDefinition,
      processInstance: { id: "pi-42" },
      cockpitUrl: "http://localhost:8080/webapp",
      repository: "Miragon/miragon-ai",
    })

    expect(result.title).toBe("[Bug]: Engine incident (failedJob) in invoice")
    expect(result.labels).toEqual(["bug", "incident"])
    expect(result.suggestedRepository).toBe("Miragon/miragon-ai")
    expect(result.suggestedTool).toBe("create_issue")

    for (const section of [
      "### Description",
      "### Steps to Reproduce",
      "### Expected Behaviour",
      "### Actual Behaviour",
      "### Engine context",
      "### Affected Module",
      "camunda7",
      "### Process Engine",
      "CIB Seven",
      "### Cockpit",
    ]) {
      expect(result.body).toContain(section)
    }
    expect(result.body).toContain("Boom: NullPointerException at line 42")
    expect(result.body).toContain("`failedJob`")
    expect(result.body).toContain(
      "http://localhost:8080/webapp/#/seven/auth/process/invoice/7/pi-42?tab=incidents",
    )
  })

  it("returns null suggestedRepository and a clarifying nextStep when no repo is configured", () => {
    const result = buildIncidentIssuePayload({
      incident: baseIncident,
      processDefinition: baseDefinition,
      repository: null,
    })
    expect(result.suggestedRepository).toBeNull()
    expect(result.nextStep).toMatch(/Ask the user which `owner\/repo`/)
  })

  it("omits the cockpit section when no cockpitUrl is configured", () => {
    const result = buildIncidentIssuePayload({
      incident: baseIncident,
      processDefinition: baseDefinition,
      repository: "owner/repo",
    })
    expect(result.body).not.toContain("### Cockpit")
  })

  it("falls back gracefully when the engine omits message / activity / definition", () => {
    const result = buildIncidentIssuePayload({
      incident: { id: "inc-x", incidentType: "failedExternalTask" },
      repository: "owner/repo",
    })
    expect(result.title).toBe("[Bug]: Engine incident (failedExternalTask) in unknown-process")
    expect(result.body).toContain("_No incident message reported by the engine._")
    expect(result.body).toContain("`unknown`")
  })

  it("trims trailing slashes from cockpitUrl when building the deeplink", () => {
    const result = buildIncidentIssuePayload({
      incident: baseIncident,
      processDefinition: baseDefinition,
      cockpitUrl: "http://localhost:8080/webapp///",
      repository: "owner/repo",
    })
    expect(result.body).toContain(
      "http://localhost:8080/webapp/#/seven/auth/process/invoice/7/pi-42?tab=incidents",
    )
  })
})
