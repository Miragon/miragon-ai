// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { CAMUNDA7_WIDGET_ACTIONS_DATA } from "../tool-names.js"
import type { JobPanelData } from "../view-models.js"
import { VariablesTable } from "./instance-sections.js"
import { JobPanelWidget } from "./job-panel.js"

afterEach(() => {
  cleanup()
  // The toolkit query client is a singleton — one test's feed answer must not
  // leak into the next test's gate.
  queryClient.clear()
})

const JOBS: JobPanelData = {
  totalCount: 1,
  failedCount: 1,
  jobs: [
    {
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
    },
  ],
  filters: {},
  engineId: "default",
}

const JobPanel = JobPanelWidget as unknown as ComponentType<Record<string, unknown>>

const Variables: ComponentType<Record<string, unknown>> = () => (
  <VariablesTable
    variables={{ amount: { value: 42, type: "Integer" } }}
    instanceId="pi-1"
    engine="default"
  />
)

function renderWith(widget: ComponentType<Record<string, unknown>>, feed: unknown) {
  const data = widget === JobPanel ? (JOBS as unknown as Record<string, unknown>) : {}
  render(
    <WidgetFixtureHost
      widget={widget}
      data={data}
      tools={{ [CAMUNDA7_WIDGET_ACTIONS_DATA]: feed }}
    />,
  )
}

/** Wait until the gate's feed query has answered, so an absent button is a decision. */
async function feedSettled() {
  await waitFor(() =>
    expect(
      queryClient.getQueryCache().find({ queryKey: ["camunda7-widget-actions"], exact: false })
        ?.state.status,
    ).toBe("success"),
  )
}

describe("write buttons follow the deployment's toolset", () => {
  it("renders the job retry button when the toolset allows it", async () => {
    renderWith(JobPanel, { allowedActions: ["camunda7_set_job_retries"] })
    expect(await screen.findByText("Retry job")).toBeTruthy()
  })

  it("hides the job retry button in read-only but keeps the AI handoffs", async () => {
    renderWith(JobPanel, { allowedActions: [] })
    await feedSettled()
    expect(screen.queryByText("Retry job")).toBeNull()
    expect(screen.getByLabelText("Explain this failure")).toBeTruthy()
  })

  it("fails closed while the feed has not answered", () => {
    renderWith(JobPanel, () => new Promise(() => {}))
    expect(screen.getByText("Card declined")).toBeTruthy()
    expect(screen.queryByText("Retry job")).toBeNull()
  })

  it("shows the variable edit column only when the write is allowed", async () => {
    renderWith(Variables, { allowedActions: ["camunda7_set_process_instance_variable"] })
    expect(await screen.findByText("Edit")).toBeTruthy()
    expect(screen.getAllByRole("columnheader")).toHaveLength(4)
  })

  it("drops the variable edit column (not just the button) in read-only", async () => {
    renderWith(Variables, { allowedActions: [] })
    await feedSettled()
    expect(screen.queryByText("Edit")).toBeNull()
    expect(screen.getAllByRole("columnheader")).toHaveLength(3)
  })
})
