import { describe, expect, it } from "vitest"
import { UNKNOWN_KEY, remediatePrompt, type RemediationCluster } from "./remediation.js"

const CLUSTER: RemediationCluster = {
  activityId: "ServiceTask_1",
  incidentType: "failedJob",
  incidentCount: 12,
  scannedIncidentCount: 12,
  last24hCount: 3,
  processDefinitionKeys: ["invoice"],
  representativeMessage: "Connection refused",
}

/**
 * The cluster retry is scoped by engine + activity + process: a dropped or
 * misnamed filter in these call templates would hand the model an
 * engine-wide failed-job list to retry (#329).
 */
describe("remediatePrompt scopes both calls to the cluster", () => {
  it("names the engine, activity and process on the incident and job lists", () => {
    const prompt = remediatePrompt(CLUSTER, "prod")
    expect(prompt).toContain(
      'camunda7_list_incidents({ engine: "prod", activityId: "ServiceTask_1", incidentType: "failedJob", processDefinitionKey: "invoice" })',
    )
    expect(prompt).toContain(
      'camunda7_list_jobs({ engine: "prod", activityId: "ServiceTask_1", processDefinitionKey: "invoice", noRetriesLeft: true })',
    )
  })

  it("checks recurrence in the incident history and reads one failed job's stacktrace", () => {
    const prompt = remediatePrompt(CLUSTER, "prod")
    expect(prompt).toContain(
      'camunda7_query_historic_incidents({ engine: "prod", activityId: "ServiceTask_1", processDefinitionKey: "invoice" })',
    )
    expect(prompt).toContain(
      'camunda7_get_job_stacktrace({ engine: "prod", jobId: <id of one failed job> })',
    )
  })

  it("asks for the key instead of inventing one when the process is unknown", () => {
    const prompt = remediatePrompt({ ...CLUSTER, processDefinitionKeys: [UNKNOWN_KEY] })
    expect(prompt).toContain(
      'camunda7_list_incidents({ engine: "the current engine", activityId: "ServiceTask_1", incidentType: "failedJob" })',
    )
    expect(prompt).toContain("processDefinitionKey: <processDefinitionKey>, noRetriesLeft: true")
  })

  it("executes nothing unconfirmed", () => {
    expect(remediatePrompt(CLUSTER, "prod")).toMatch(/execute nothing until I confirm\.$/)
  })
})

describe("remediatePrompt fixes bad data from the whole value", () => {
  // The model-facing variable reads cut long values (`truncated: true`): a
  // "fix the variable" step built from that read writes the prefix back and
  // silently loses the rest. The fix must start from the whole read (#340).
  it("reads a bad variable whole before it is set", () => {
    const prompt = remediatePrompt(CLUSTER, "prod")
    const read = prompt.indexOf(
      'camunda7_get_process_instance_variables({ engine: "prod", processInstanceId: <the instance>, variableName: <the variable> })',
    )
    const write = prompt.indexOf("camunda7_set_process_instance_variable")
    expect(read).toBeGreaterThan(-1)
    expect(write).toBeGreaterThan(read)
  })
})
