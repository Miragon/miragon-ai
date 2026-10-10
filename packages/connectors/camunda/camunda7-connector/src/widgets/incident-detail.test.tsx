// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import {
  CAMUNDA7_INCIDENT_DETAIL_DATA,
  CAMUNDA7_WIDGET_ACTIONS,
  CAMUNDA7_WIDGET_ACTIONS_DATA,
} from "../tool-names.js"
import type { IncidentDetailData, IncidentInstance } from "../view-models.js"
import { IncidentDetailWidget } from "./incident-detail.js"
import { IncidentTable } from "./process-incidents/incident-table.js"
import { useIncidentRecovery } from "./process-incidents/use-incident-recovery.js"

/**
 * #328 in the incident DETAIL view: the failure tab offers the remedy the
 * engine accepts — Retry (job or external-task retries) for the built-in
 * types, Resolve only for custom incidents — each only when the toolset has
 * its tool. And a result stored before `recovery` existed still renders: the
 * host hands the current view the old structuredContent of a reopened chat.
 */

afterEach(() => {
  cleanup()
  queryClient.clear()
})

const ALL_ACTIONS = { allowedActions: [...CAMUNDA7_WIDGET_ACTIONS] }

function detail(over: Partial<IncidentDetailData>): IncidentDetailData {
  return {
    incidentId: "inc-1",
    incidentType: "failedJob",
    incidentMessage: "boom",
    incidentTimestamp: "2026-10-09T09:30:00.000+0000",
    activityId: "charge",
    activityName: "Charge card",
    processDefinitionKey: "invoice",
    processDefinitionId: "invoice:1:abc",
    processDefinitionName: "Invoice",
    processDefinitionVersion: 1,
    processInstanceId: "pi-1",
    businessKey: null,
    cockpitInstanceUrl: null,
    bpmnXml: null,
    job: null,
    recovery: { action: "resolve" },
    instance: {
      id: "pi-1",
      definitionId: "invoice:1:abc",
      businessKey: null,
      suspended: false,
      ended: false,
    },
    activityTree: null,
    variables: {},
    historyTotalCount: null,
    engineId: "prod",
    ...over,
  }
}

const JOB = { id: "job-1", retries: 0, exceptionMessage: "boom", stacktrace: null, dueDate: null }

const FAILED_JOB = detail({ job: JOB, recovery: { action: "retry-job", jobId: "job-1" } })
const FAILED_TASK = detail({
  incidentType: "failedExternalTask",
  recovery: { action: "retry-external-task", externalTaskId: "ext-1" },
})
const CUSTOM = detail({ incidentType: "invoiceMismatch" })

type Calls = Array<[string, Record<string, unknown>]>

function renderDetail(data: IncidentDetailData, tools: Record<string, unknown>) {
  const widget = IncidentDetailWidget as unknown as ComponentType<Record<string, unknown>>
  render(
    <WidgetFixtureHost
      widget={widget}
      data={data as unknown as Record<string, unknown>}
      tools={tools}
    />,
  )
}

function recording(calls: Calls, ...names: string[]): Record<string, unknown> {
  return Object.fromEntries(
    names.map((name) => [
      name,
      (args: Record<string, unknown>) => {
        calls.push([name, args])
        return { success: true }
      },
    ]),
  )
}

/** Wait until the toolset gate answered, so an absent button is a decision. */
async function gateSettled() {
  await waitFor(() =>
    expect(
      queryClient.getQueryCache().find({ queryKey: ["camunda7-widget-actions"], exact: false })
        ?.state.status,
    ).toBe("success"),
  )
}

describe("the incident detail offers the remedy the engine accepts", () => {
  it("failedJob: Retry job sets the job's retries to 1 on the incident's engine — no Resolve", async () => {
    const calls: Calls = []
    renderDetail(FAILED_JOB, {
      [CAMUNDA7_WIDGET_ACTIONS_DATA]: ALL_ACTIONS,
      ...recording(calls, "camunda7_set_job_retries", "camunda7_set_external_task_retries"),
    })
    fireEvent.click(await screen.findByText("Retry job"))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual([
      "camunda7_set_job_retries",
      { jobId: "job-1", retries: 1, engine: "prod" },
    ])
    expect(screen.queryByText("Resolve")).toBeNull()
  })

  it("failedExternalTask: Retry task sets the external task's retries — no Resolve", async () => {
    const calls: Calls = []
    renderDetail(FAILED_TASK, {
      [CAMUNDA7_WIDGET_ACTIONS_DATA]: ALL_ACTIONS,
      ...recording(calls, "camunda7_set_job_retries", "camunda7_set_external_task_retries"),
    })
    fireEvent.click(await screen.findByText("Retry task"))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual([
      "camunda7_set_external_task_retries",
      { externalTaskId: "ext-1", retries: 1, engine: "prod" },
    ])
    expect(screen.queryByText("Resolve")).toBeNull()
  })

  it("a custom incident gets Resolve and no Retry", async () => {
    renderDetail(CUSTOM, { [CAMUNDA7_WIDGET_ACTIONS_DATA]: ALL_ACTIONS })
    expect(await screen.findByText("Resolve")).toBeTruthy()
    expect(screen.queryByText("Retry job")).toBeNull()
    expect(screen.queryByText("Retry task")).toBeNull()
  })

  it("offers no remedy once a refetch cannot confirm the incident is still open", async () => {
    renderDetail(FAILED_JOB, {
      [CAMUNDA7_WIDGET_ACTIONS_DATA]: ALL_ACTIONS,
      [CAMUNDA7_INCIDENT_DETAIL_DATA]: () => {
        throw new Error("Incident inc-1 does not exist")
      },
    })
    expect(await screen.findByText("Retry job")).toBeTruthy()
    // A write elsewhere (a variable edit) or a refresh re-reads the incident.
    void queryClient.invalidateQueries({ queryKey: ["camunda7:incident-detail"] })
    expect(await screen.findByText(/inc-1 does not exist/)).toBeTruthy()
    expect(screen.queryByText("Retry job")).toBeNull()
  })

  it("hides Retry when the toolset lacks the retries tool (and never falls back to Resolve)", async () => {
    renderDetail(FAILED_JOB, {
      [CAMUNDA7_WIDGET_ACTIONS_DATA]: { allowedActions: ["camunda7_resolve_incident"] },
    })
    await gateSettled()
    expect(await screen.findAllByText("failedJob")).not.toHaveLength(0)
    expect(screen.queryByText("Retry job")).toBeNull()
    expect(screen.queryByText("Resolve")).toBeNull()
  })
})

describe("a result stored before `recovery` existed still renders", () => {
  const stored = (data: IncidentDetailData): IncidentDetailData => {
    const old = { ...data }
    delete old.recovery
    return old
  }

  it("detail: a failedJob with its job keeps Retry, a custom one keeps Resolve", async () => {
    renderDetail(stored(FAILED_JOB), { [CAMUNDA7_WIDGET_ACTIONS_DATA]: ALL_ACTIONS })
    expect(await screen.findByText("Retry job")).toBeTruthy()
    cleanup()
    queryClient.clear()
    renderDetail(stored(CUSTOM), { [CAMUNDA7_WIDGET_ACTIONS_DATA]: ALL_ACTIONS })
    expect(await screen.findByText("Resolve")).toBeTruthy()
  })

  it("detail: a failedExternalTask without a target offers no action instead of crashing", async () => {
    renderDetail(stored(FAILED_TASK), { [CAMUNDA7_WIDGET_ACTIONS_DATA]: ALL_ACTIONS })
    await gateSettled()
    expect(await screen.findAllByText("failedExternalTask")).not.toHaveLength(0)
    expect(screen.queryByText("Retry task")).toBeNull()
    expect(screen.queryByText("Resolve")).toBeNull()
  })

  it("list rows without `recovery` render: custom → Resolve, built-in → no action", async () => {
    const rows = [
      { id: "a", incidentType: "invoiceMismatch", incidentMessage: "message a" },
      { id: "b", incidentType: "failedJob", incidentMessage: "message b" },
    ].map((row): IncidentInstance => ({
      ...row,
      processInstanceId: "pi-1",
      incidentTimestamp: "2026-10-09T09:30:00.000+0000",
      cockpitInstanceUrl: null,
    }))
    const Rows: ComponentType<Record<string, unknown>> = () => {
      const recovery = useIncidentRecovery("prod", { resetOn: rows })
      return <IncidentTable incidents={rows} recovery={recovery} onAnalyze={() => {}} />
    }
    render(
      <WidgetFixtureHost
        widget={Rows}
        data={{}}
        tools={{ [CAMUNDA7_WIDGET_ACTIONS_DATA]: ALL_ACTIONS }}
      />,
    )
    const buttonsOf = async (message: string) =>
      [...(await screen.findByText(message)).closest("tr")!.querySelectorAll("button")].map(
        (b) => b.textContent,
      )
    await waitFor(async () => expect(await buttonsOf("message a")).toContain("Resolve"))
    expect(await buttonsOf("message b")).not.toContain("Resolve")
    expect(await buttonsOf("message b")).not.toContain("Retry")
  })
})
