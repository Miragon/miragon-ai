// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import {
  CAMUNDA7_COCKPIT_OVERVIEW_DATA,
  CAMUNDA7_ENGINE_HEALTH_DATA,
  CAMUNDA7_INSTANCE_DETAIL_DATA,
  CAMUNDA7_JOBS_DATA,
  CAMUNDA7_LIST_ENGINES,
  CAMUNDA7_WIDGET_ACTIONS_DATA,
} from "../tool-names.js"
import type { InstanceDetailData, JobPanelData, OpenUserTask } from "../view-models.js"
import { CockpitApp } from "./cockpit-app/app.js"
import { InstanceDetailWidget } from "./instance-detail.js"
import { JobPanelWidget } from "./job-panel.js"
import { widgetActionsFeedFor } from "./lib/hand-off.test-support.js"

/**
 * #341 — the in-widget write path: a write refreshes the data it changed in
 * BOTH modes (a standalone show view seeds its query with the tool result
 * instead of freezing it), the instance view offers only the actions its
 * CURRENT state allows, and a confirmation names what it acts on with two
 * buttons that cannot be confused.
 */

const toolkitDefaults = queryClient.getDefaultOptions()

beforeEach(() => {
  // The shared client retries a failed query with backoff — answer at once.
  queryClient.setDefaultOptions({
    ...toolkitDefaults,
    queries: { ...toolkitDefaults.queries, retry: false },
  })
})

afterEach(() => {
  cleanup()
  queryClient.clear()
  queryClient.setDefaultOptions(toolkitDefaults)
})

/** What an admin deployment's feed answers — every in-widget write is offered. */
let adminActions: { allowedActions: string[]; modelTools: string[] }
beforeAll(async () => {
  adminActions = await widgetActionsFeedFor("admin")
})

function task(id: string, name: string): OpenUserTask {
  return {
    id,
    name,
    assignee: null,
    created: "2026-10-10T08:00:00.000+0000",
    due: null,
    priority: 50,
    processDefinitionId: "invoice:1:abc",
    processInstanceId: "pi-1",
    taskDefinitionKey: id,
    description: null,
    formSchema: { taskId: id, fields: [] },
  }
}

function instance(over: Partial<InstanceDetailData> = {}): InstanceDetailData {
  return {
    instance: {
      id: "pi-1",
      definitionId: "invoice:1:abc",
      businessKey: "INV-7",
      suspended: false,
      ended: false,
    },
    activityTree: null,
    variables: { amount: { value: 42, type: "Integer" } },
    incidents: [],
    incidentCount: 0,
    bpmnXml: null,
    activeActivityIds: ["review"],
    incidentActivityIds: [],
    openTasks: [task("review", "Review invoice")],
    openTaskCount: 1,
    engineId: "prod",
    ...over,
  }
}

/** The instance after its review task completed: the next task is open. */
const AFTER_REVIEW = instance({
  activeActivityIds: ["approve"],
  openTasks: [task("approve", "Approve invoice")],
  variables: { amount: { value: 42, type: "Integer" }, reviewed: { value: true, type: "Boolean" } },
})

type Calls = Array<[string, Record<string, unknown>]>

function recorder(calls: Calls, name: string, answer: (args: Record<string, unknown>) => unknown) {
  return {
    [name]: (args: Record<string, unknown>) => {
      calls.push([name, args])
      return answer(args)
    },
  }
}

const Standalone = InstanceDetailWidget as unknown as ComponentType<Record<string, unknown>>
const InCockpit: ComponentType<Record<string, unknown>> = () => (
  <InstanceDetailWidget processInstanceId="pi-1" engine="prod" />
)

function renderInstance(
  widget: ComponentType<Record<string, unknown>>,
  data: InstanceDetailData | null,
  tools: Record<string, unknown>,
) {
  render(
    <WidgetFixtureHost
      widget={widget}
      data={(data ?? {}) as unknown as Record<string, unknown>}
      tools={{ [CAMUNDA7_WIDGET_ACTIONS_DATA]: adminActions, ...tools }}
    />,
  )
}

async function completeTheOpenTask() {
  fireEvent.click(await screen.findByRole("button", { name: "Complete" }))
  fireEvent.click(await screen.findByRole("button", { name: "Complete task" }))
}

const feedCalls = (calls: Calls) => calls.filter(([name]) => name === CAMUNDA7_INSTANCE_DETAIL_DATA)

describe("completing a user task refreshes the instance (N99)", () => {
  it("standalone: the tool result is a seed — the view refetches and shows the next task", async () => {
    const calls: Calls = []
    renderInstance(Standalone, instance(), {
      ...recorder(calls, "camunda7_complete_task", () => ({ success: true, outcome: "completed" })),
      ...recorder(calls, CAMUNDA7_INSTANCE_DETAIL_DATA, () => AFTER_REVIEW),
    })
    expect(await screen.findByText("Review invoice")).toBeTruthy()
    // A fresh seed is not refetched on mount: the show tool just read it.
    expect(feedCalls(calls)).toHaveLength(0)

    await completeTheOpenTask()

    expect(await screen.findByText("Approve invoice")).toBeTruthy()
    expect(screen.queryByText("Review invoice")).toBeNull()
    // The refetch is scoped to the engine and instance the seed came from.
    expect(feedCalls(calls)).toEqual([
      [CAMUNDA7_INSTANCE_DETAIL_DATA, { processInstanceId: "pi-1", engine: "prod" }],
    ])
    expect(calls[0]).toEqual([
      "camunda7_complete_task",
      { taskId: "review", variables: {}, engine: "prod" },
    ])
  })

  it("cockpit: the self-fetched instance refetches after the completion", async () => {
    const calls: Calls = []
    let current = instance()
    renderInstance(InCockpit, null, {
      ...recorder(calls, "camunda7_complete_task", () => {
        current = AFTER_REVIEW
        return { success: true, outcome: "completed" }
      }),
      ...recorder(calls, CAMUNDA7_INSTANCE_DETAIL_DATA, () => current),
    })
    expect(await screen.findByText("Review invoice")).toBeTruthy()

    await completeTheOpenTask()

    expect(await screen.findByText("Approve invoice")).toBeTruthy()
    expect(feedCalls(calls)).toHaveLength(2)
  })

  it("offers no Suspend/Cancel once the refetch cannot confirm the instance is still running", async () => {
    // Completing the LAST task ends the instance: the runtime read is a 404
    // now, so the stale snapshot must not keep offering instance actions.
    renderInstance(Standalone, instance(), {
      camunda7_complete_task: () => ({ success: true, outcome: "completed" }),
      [CAMUNDA7_INSTANCE_DETAIL_DATA]: () => {
        throw new Error("Process instance with id pi-1 does not exist")
      },
    })
    expect(await screen.findByRole("button", { name: "Suspend" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Cancel instance" })).toBeTruthy()

    await completeTheOpenTask()

    expect(await screen.findByText(/pi-1 does not exist/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Suspend" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Cancel instance" })).toBeNull()
    // The way out of the stale state: retry the read.
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
  })
})

describe("a confirmation names its target (N108)", () => {
  it("cancel: names instance, business key and engine; Keep instance vs Cancel instance", async () => {
    const calls: Calls = []
    renderInstance(Standalone, instance(), {
      ...recorder(calls, "camunda7_delete_process_instance", () => ({ success: true })),
    })
    fireEvent.click(await screen.findByRole("button", { name: "Cancel instance" }))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("pi-1")).toBeTruthy()
    expect(within(dialog).getByText("INV-7")).toBeTruthy()
    expect(within(dialog).getByText("prod")).toBeTruthy()
    const buttons = within(dialog)
      .getAllByRole("button")
      .map((b) => b.textContent)
    expect(buttons).toContain("Keep instance")
    expect(buttons).toContain("Cancel instance")
    // Never a bare "Cancel" next to "Cancel instance".
    expect(buttons).not.toContain("Cancel")

    fireEvent.click(within(dialog).getByRole("button", { name: "Keep instance" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(calls).toHaveLength(0)
  })

  it("suspend: names the instance; Keep running vs Suspend instance", async () => {
    const calls: Calls = []
    renderInstance(Standalone, instance(), {
      ...recorder(calls, "camunda7_set_process_instance_suspension", () => ({ success: true })),
      [CAMUNDA7_INSTANCE_DETAIL_DATA]: () => instance(),
    })
    fireEvent.click(await screen.findByRole("button", { name: "Suspend" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("pi-1")).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: "Keep running" })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend instance" }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual([
      "camunda7_set_process_instance_suspension",
      { processInstanceId: "pi-1", suspended: true, engine: "prod" },
    ])
  })

  it("resolve: names the incident and its instance; Keep open vs Resolve incident", async () => {
    const calls: Calls = []
    const withIncident = instance({
      incidents: [
        {
          id: "inc-9",
          processInstanceId: "pi-1",
          incidentType: "invoiceMismatch",
          incidentMessage: "amount mismatch",
          incidentTimestamp: "2026-10-10T08:00:00.000+0000",
          cockpitInstanceUrl: null,
          recovery: { action: "resolve" },
        },
      ],
      incidentCount: 1,
      openTasks: [],
      openTaskCount: 0,
    })
    renderInstance(Standalone, withIncident, {
      ...recorder(calls, "camunda7_resolve_incident", () => ({ success: true })),
    })
    fireEvent.click(await screen.findByRole("button", { name: "Resolve" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("inc-9")).toBeTruthy()
    expect(within(dialog).getByText("invoiceMismatch")).toBeTruthy()
    expect(within(dialog).getByText("pi-1")).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: "Keep open" })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "Resolve incident" }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual(["camunda7_resolve_incident", { incidentId: "inc-9", engine: "prod" }])
  })
})

describe("the cockpit refreshes and retries instead of dead-ending (N103)", () => {
  it("an instance that failed to load offers a Retry", async () => {
    let fail = true
    renderInstance(InCockpit, null, {
      [CAMUNDA7_INSTANCE_DETAIL_DATA]: () => {
        if (fail) throw new Error("engine timeout")
        return instance()
      },
    })
    expect(await screen.findByText("engine timeout")).toBeTruthy()
    fail = false
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Review invoice")).toBeTruthy()
  })

  it("the cockpit's Refresh re-reads the open view's feed", async () => {
    const overviewCalls: unknown[] = []
    const Cockpit: ComponentType<Record<string, unknown>> = () => (
      <CockpitApp data={{ engineId: "prod", engines: [{ id: "prod", environment: "default" }] }} />
    )
    render(
      <WidgetFixtureHost
        widget={Cockpit}
        data={{}}
        tools={{
          [CAMUNDA7_LIST_ENGINES]: { engines: [{ id: "prod" }], defaultEngineId: null },
          [CAMUNDA7_ENGINE_HEALTH_DATA]: (args: Record<string, unknown>) => {
            overviewCalls.push(args)
            throw new Error("not under test")
          },
          [CAMUNDA7_COCKPIT_OVERVIEW_DATA]: (args: Record<string, unknown>) => {
            overviewCalls.push(args)
            return {
              summary: {
                totalDefinitions: 0,
                totalRunningInstances: 0,
                totalFailedJobs: 0,
                totalIncidents: 0,
              },
              definitions: [],
              engineId: "prod",
            }
          },
        }}
      />,
    )
    const refresh = await screen.findByRole("button", { name: "↻ Refresh" })
    await waitFor(() => expect(overviewCalls.length).toBeGreaterThan(0))
    const before = overviewCalls.length
    fireEvent.click(refresh)
    await waitFor(() => expect(overviewCalls.length).toBeGreaterThan(before))
  })
})

const FAILED_JOB: JobPanelData["jobs"][number] = {
  id: "job-1",
  processInstanceId: "pi-1",
  processDefinitionKey: "invoice",
  processDefinitionId: "invoice:1:abc",
  activityId: "chargeCard",
  retries: 0,
  exceptionMessage: "Card declined",
  dueDate: null,
  suspended: false,
  priority: 0,
  createTime: "2026-06-11T08:00:00.000Z",
}

const JOBS: JobPanelData = {
  totalCount: 1,
  failedCount: 1,
  jobs: [FAILED_JOB],
  filters: { failedOnly: true },
  engineId: "prod",
}

describe("a standalone show view refreshes after a write (K46)", () => {
  it("job panel: Retry refetches the seeded page — the retried job leaves the failed-only list", async () => {
    const calls: Calls = []
    const AFTER_RETRY: JobPanelData = { ...JOBS, totalCount: 0, failedCount: 0, jobs: [] }
    render(
      <WidgetFixtureHost
        widget={JobPanelWidget as unknown as ComponentType<Record<string, unknown>>}
        data={JOBS as unknown as Record<string, unknown>}
        tools={{
          [CAMUNDA7_WIDGET_ACTIONS_DATA]: adminActions,
          ...recorder(calls, "camunda7_set_job_retries", () => ({ success: true })),
          ...recorder(calls, CAMUNDA7_JOBS_DATA, () => AFTER_RETRY),
        }}
      />,
    )
    fireEvent.click(await screen.findByRole("button", { name: "Retry job" }))

    expect(await screen.findByText("No jobs found")).toBeTruthy()
    expect(calls.map(([name]) => name)).toEqual(["camunda7_set_job_retries", CAMUNDA7_JOBS_DATA])
    expect(calls[1][1]).toMatchObject({ engine: "prod", failedOnly: true, firstResult: 0 })
  })
})
