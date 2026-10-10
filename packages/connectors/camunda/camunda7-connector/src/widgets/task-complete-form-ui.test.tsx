// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { CAMUNDA7_WIDGET_ACTIONS_DATA } from "../tool-names.js"
import type { TaskFormSchema } from "../view-models.js"
import type { CompleteTaskArgs, TaskCompletion } from "./lib/complete-task.js"
import { useEngineAction } from "./lib/engine-action.js"
import { TaskCompleteForm } from "./task-complete-form.js"

/**
 * #328 review findings in the task form: a delegated task is resolved, not
 * completed — the form must say so instead of reporting completion; a linked
 * Camunda Form (formRef) is not "no form"; and a schema the server could not
 * build (null) is loaded through camunda7_get_task_form, whose failure shows.
 */

afterEach(() => {
  cleanup()
  queryClient.clear()
})

/** The deployment offers the completion — the form's submit is gated by it. */
const COMPLETE_ALLOWED = { allowedActions: ["camunda7_complete_task"] }

function renderForm(
  formSchema: TaskFormSchema | null,
  tools: Record<string, unknown>,
  onCompleted: () => void = () => {},
) {
  const Form: ComponentType<Record<string, unknown>> = () => {
    const complete = useEngineAction<CompleteTaskArgs, TaskCompletion>({
      tool: "camunda7_complete_task",
      target: (args) => args.taskId,
    })
    return (
      <TaskCompleteForm
        taskId="t-1"
        engine="prod"
        formSchema={formSchema}
        action={complete}
        onCompleted={onCompleted}
      />
    )
  }
  render(
    <WidgetFixtureHost
      widget={Form}
      data={{}}
      tools={{ [CAMUNDA7_WIDGET_ACTIONS_DATA]: COMPLETE_ALLOWED, ...tools }}
    />,
  )
}

const NO_FIELDS: TaskFormSchema = { taskId: "t-1", fields: [] }

describe("the task form reports what the engine did", () => {
  it("a delegated task went back to its owner — shown as such, never as completed", async () => {
    let completed = 0
    renderForm(
      NO_FIELDS,
      {
        camunda7_complete_task: () => ({
          success: true,
          taskId: "t-1",
          outcome: "resolved",
          assignee: "mary",
        }),
      },
      () => completed++,
    )
    fireEvent.click(await screen.findByText("Complete task"))
    expect(await screen.findByText(/back to its owner \(mary\)/)).toBeTruthy()
    expect(completed).toBe(0)
  })

  it("a completed task closes the form", async () => {
    let completed = 0
    renderForm(
      NO_FIELDS,
      { camunda7_complete_task: () => ({ success: true, taskId: "t-1", outcome: "completed" }) },
      () => completed++,
    )
    fireEvent.click(await screen.findByText("Complete task"))
    await waitFor(() => expect(completed).toBe(1))
    expect(screen.queryByText(/back to its owner/)).toBeNull()
  })
})

describe("the task form never passes an unknown form for 'no form'", () => {
  it("names a linked Camunda Form (formRef)", async () => {
    renderForm({ ...NO_FIELDS, formRef: "invoiceForm" }, {})
    expect(await screen.findByText(/uses its own form \(invoiceForm\)/)).toBeTruthy()
    expect(screen.queryByText("No form is defined for this task.")).toBeNull()
  })

  it("loads a schema the server could not build, and shows that load's failure", async () => {
    // The shared client retries a failed query with backoff — answer at once.
    queryClient.setQueryDefaults(["camunda7", "task-form"], { retry: false })
    const asked: unknown[] = []
    renderForm(null, {
      camunda7_get_task_form: (args: unknown) => {
        asked.push(args)
        throw new Error("[403] not authorized")
      },
    })
    expect(await screen.findByText(/Could not load task form: .*not authorized/)).toBeTruthy()
    expect(asked).toEqual([{ taskId: "t-1", engine: "prod" }])
    expect(screen.queryByText("No form is defined for this task.")).toBeNull()
  })
})
