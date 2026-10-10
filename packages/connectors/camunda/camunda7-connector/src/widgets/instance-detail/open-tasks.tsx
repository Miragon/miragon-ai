import { useMemo, useState } from "react"
import { Button, Card, CardContent } from "@miragon/mcp-toolkit-ui"

import type { OpenUserTask } from "../../view-models.js"
import type { CompleteTaskAction, CompleteTaskArgs, TaskCompletion } from "../lib/complete-task.js"
import { useEngineAction } from "../lib/engine-action.js"
import { TaskCompleteForm } from "../task-complete-form.js"
import { useT } from "../../messages/use-t.js"

/**
 * The open-task state of the instance view: the completion write (one
 * `EngineAction` for every task card — it refetches the instance, so the
 * next task, the status, the tokens and the variables follow) plus the single
 * expanded task form. A completed task disappears at once; the mark only
 * bridges the gap until the refetched `openTasks` arrive, then server truth
 * wins. A delegated task is RESOLVED back to its owner and stays listed.
 * `available` is the instance's state: a task of an ended, cancelled,
 * suspended or unconfirmed instance cannot be completed, so none is offered.
 */
export function useOpenTasks(openTasks: OpenUserTask[] | undefined, available: boolean) {
  const complete = useEngineAction<CompleteTaskArgs, TaskCompletion>({
    tool: "camunda7_complete_task",
    target: (args) => args.taskId,
    resetOn: openTasks,
    available,
  })
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const done = complete.done

  const visibleTasks = useMemo<OpenUserTask[]>(
    () =>
      (openTasks ?? []).filter((task) => {
        const completion = done.get(task.id)
        return completion === undefined || completion.result?.outcome === "resolved"
      }),
    [openTasks, done],
  )

  const onToggleTask = (taskId: string) => setActiveTaskId(activeTaskId === taskId ? null : taskId)
  const onTaskCompleted = () => setActiveTaskId(null)

  return { complete, visibleTasks, activeTaskId, onToggleTask, onTaskCompleted }
}

function OpenTaskCard({
  task,
  engine,
  complete,
  canComplete,
  expanded,
  onToggle,
  onCompleted,
}: {
  task: OpenUserTask
  engine?: string
  complete: CompleteTaskAction
  /** False when the toolset has no complete tool or the instance's state allows none — no form toggle. */
  canComplete: boolean
  expanded: boolean
  onToggle: () => void
  onCompleted: () => void
}) {
  const t = useT()
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <div className="font-medium">{task.name ?? task.taskDefinitionKey}</div>
            <div className="text-muted-foreground font-mono text-xs">
              {task.taskDefinitionKey}
              {task.assignee && <> · {t("instanceDetail.assignee", { name: task.assignee })}</>}
              {!task.assignee && <> · {t("instanceDetail.unassigned")}</>}
            </div>
          </div>
          {canComplete && (
            <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={onToggle}>
              {expanded ? t("instanceDetail.close") : t("instanceDetail.complete")}
            </Button>
          )}
        </div>
        {canComplete && expanded && (
          <div className="mt-3 border-t pt-3">
            <TaskCompleteForm
              taskId={task.id}
              engine={engine}
              formSchema={task.formSchema}
              action={complete}
              onCompleted={onCompleted}
              onCancel={onToggle}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The "Tasks" tab body — the open-task cards with their inline complete forms
 * (only where the deployment's toolset exposes `camunda7_complete_task` and
 * the instance's current state allows a completion — `useOpenTasks`).
 */
export function OpenTasksTab({
  openTasks,
  visibleTasks,
  engineId,
  complete,
  activeTaskId,
  onToggleTask,
  onTaskCompleted,
}: {
  openTasks: OpenUserTask[]
  visibleTasks: OpenUserTask[]
  engineId?: string
  complete: CompleteTaskAction
  activeTaskId: string | null
  onToggleTask: (taskId: string) => void
  onTaskCompleted: () => void
}) {
  const t = useT()
  const canComplete = complete.allowed
  if (visibleTasks.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {(openTasks ?? []).length > 0
          ? t("instanceDetail.tasksAllCompleted")
          : t("instanceDetail.noOpenTasks")}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {visibleTasks.map((task) => (
        <OpenTaskCard
          key={task.id}
          task={task}
          engine={engineId}
          complete={complete}
          canComplete={canComplete}
          expanded={activeTaskId === task.id}
          onToggle={() => onToggleTask(task.id)}
          onCompleted={onTaskCompleted}
        />
      ))}
    </div>
  )
}
