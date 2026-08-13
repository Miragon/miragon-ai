import { useMemo, useState } from "react"
import { Button, Card, CardContent } from "@miragon/mcp-toolkit-ui"

import type { OpenUserTask } from "../../view-models.js"
import { TaskCompleteForm } from "../task-complete-form.js"
import { useT } from "../../messages/use-t.js"

/**
 * Local open-task state: optimistic completed marks (a completed task
 * disappears until the feed refetches) plus the single expanded task form.
 */
export function useOpenTasks(openTasks: OpenUserTask[] | undefined) {
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set())
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)

  const visibleTasks = useMemo<OpenUserTask[]>(
    () => (openTasks ?? []).filter((task) => !completedTaskIds.has(task.id)),
    [openTasks, completedTaskIds],
  )

  const onToggleTask = (taskId: string) => setActiveTaskId(activeTaskId === taskId ? null : taskId)
  const onTaskCompleted = (taskId: string) => {
    setCompletedTaskIds((prev) => new Set(prev).add(taskId))
    setActiveTaskId(null)
  }

  return { visibleTasks, activeTaskId, onToggleTask, onTaskCompleted }
}

function OpenTaskCard({
  task,
  engine,
  expanded,
  onToggle,
  onCompleted,
}: {
  task: OpenUserTask
  engine?: string
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
          <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={onToggle}>
            {expanded ? t("instanceDetail.close") : t("instanceDetail.complete")}
          </Button>
        </div>
        {expanded && (
          <div className="mt-3 border-t pt-3">
            <TaskCompleteForm
              taskId={task.id}
              engine={engine}
              formSchema={task.formSchema}
              onCompleted={onCompleted}
              onCancel={onToggle}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** The "Tasks" tab body — the open-task cards with their inline complete forms. */
export function OpenTasksTab({
  openTasks,
  visibleTasks,
  engineId,
  activeTaskId,
  onToggleTask,
  onTaskCompleted,
}: {
  openTasks: OpenUserTask[]
  visibleTasks: OpenUserTask[]
  engineId?: string
  activeTaskId: string | null
  onToggleTask: (taskId: string) => void
  onTaskCompleted: (taskId: string) => void
}) {
  const t = useT()
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
          expanded={activeTaskId === task.id}
          onToggle={() => onToggleTask(task.id)}
          onCompleted={() => onTaskCompleted(task.id)}
        />
      ))}
    </div>
  )
}
