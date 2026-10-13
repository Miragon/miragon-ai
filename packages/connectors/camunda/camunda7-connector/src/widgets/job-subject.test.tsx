// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import type { JobPanelData } from "../view-models.js"
import { JobPanelWidget } from "./job-panel.js"

/**
 * A job row names what it is about in two lines (#396, inline fit): the
 * activity by name, then its id and, in a panel over several processes, the
 * process. A panel scoped to one process names that process once, in its
 * head, not in every row: three-line rows cost a chat card a row.
 */

afterEach(() => {
  cleanup()
  queryClient.clear()
})

const JOB: JobPanelData["jobs"][number] = {
  id: "job-1",
  processInstanceId: "pi-1",
  processDefinitionKey: "invoice",
  processDefinitionId: "invoice:1:abc",
  processDefinitionName: "Invoice receipt",
  activityId: "Activity_ChargeCard",
  activityName: "Charge card",
  retries: 0,
  exceptionMessage: "Card declined",
  dueDate: null,
  suspended: false,
  priority: 0,
  createTime: "2026-06-11T08:00:00.000Z",
}

function renderPanel(filters: JobPanelData["filters"]) {
  const data: JobPanelData = {
    totalCount: 1,
    failedCount: 1,
    jobs: [JOB],
    filters,
    engineId: "prod",
  }
  render(
    <WidgetFixtureHost
      widget={JobPanelWidget as unknown as ComponentType<Record<string, unknown>>}
      data={data as unknown as Record<string, unknown>}
    />,
  )
  return screen.getByText("Charge card").closest("td")!
}

describe("a job's subject", () => {
  it("over several processes: the activity, then its id and its process on one quiet line", () => {
    const cell = renderPanel({})
    expect(cell.textContent).toBe("Charge cardActivity_ChargeCard · in Invoice receipt")
  })

  it("in a panel scoped to one process: the activity and its id, no process", () => {
    const cell = renderPanel({ processDefinitionKey: "invoice" })
    expect(cell.textContent).toBe("Charge cardActivity_ChargeCard")
  })

  it("without an activity: the process alone under the dash", () => {
    const data: JobPanelData = {
      totalCount: 1,
      failedCount: 1,
      jobs: [{ ...JOB, activityId: null, activityName: null }],
      filters: {},
      engineId: "prod",
    }
    render(
      <WidgetFixtureHost
        widget={JobPanelWidget as unknown as ComponentType<Record<string, unknown>>}
        data={data as unknown as Record<string, unknown>}
      />,
    )
    expect(screen.getByText("in Invoice receipt")).toBeTruthy()
  })
})
