import type { EngineAction } from "./engine-action.js"

/** The `camunda7_complete_task` call a task form submits. */
export interface CompleteTaskArgs extends Record<string, unknown> {
  taskId: string
  variables: Record<string, { value: unknown; type?: string }>
  engine?: string
}

/** What `camunda7_complete_task` reports: a delegated task is resolved, not completed. */
export interface TaskCompletion {
  outcome?: "completed" | "resolved"
  /** For a resolved task: its owner, now its assignee again. */
  assignee?: string | null
}

/** The completion write a task form submits through — owned by the task list (`useOpenTasks`). */
export type CompleteTaskAction = EngineAction<CompleteTaskArgs, TaskCompletion>
