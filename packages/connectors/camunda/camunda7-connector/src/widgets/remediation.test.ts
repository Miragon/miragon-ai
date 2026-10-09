import { describe, expect, it } from "vitest"
import { UNKNOWN_KEY, remediatePrompt, type RemediationCluster } from "./remediation.js"

const CLUSTER: RemediationCluster = {
  activityId: "ServiceTask_1",
  incidentType: "failedJob",
  incidentCount: 12,
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
})
