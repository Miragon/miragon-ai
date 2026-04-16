import { useState } from "react"
import {
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Card,
  CardContent,
  Alert,
  AlertDescription,
  Button,
  Input,
  useToolMutation,
} from "@miragon/mcp-toolkit-ui"

import type { TaskDashboardData, TaskData } from "@automation-mcp/client-camunda7"

export type { TaskDashboardData }

function PriorityBadge({ priority }: { priority: number }) {
  const level = priority >= 75 ? "high" : priority >= 50 ? "medium" : "normal"
  const colors = {
    high: "bg-destructive/10 text-destructive",
    medium: "bg-warning/10 text-warning-foreground",
    normal: "bg-success/10 text-success-foreground",
  }
  return (
    <Badge variant="secondary" className={colors[level]}>
      {level}
    </Badge>
  )
}

function TimeAgo({ date }: { date: string }) {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  let text: string
  if (diffDays > 0) text = `${diffDays}d ago`
  else if (diffHours > 0) text = `${diffHours}h ago`
  else if (diffMins > 0) text = `${diffMins}m ago`
  else text = "just now"

  return (
    <span className="text-muted-foreground text-sm" title={then.toLocaleString()}>
      {text}
    </span>
  )
}

interface TaskState {
  assignee: string | null
  completed: boolean
}

export function TaskDashboardWidget({ data }: { data: TaskDashboardData | null }) {
  const [taskStates, setTaskStates] = useState<Map<string, TaskState>>(new Map())
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null)
  const [claimUserId, setClaimUserId] = useState("")
  const claimMutation = useToolMutation("camunda7_claim_task")
  const unclaimMutation = useToolMutation("camunda7_unclaim_task")
  const completeMutation = useToolMutation("camunda7_complete_task")

  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  function getTaskState(task: TaskData): TaskState {
    return taskStates.get(task.id) ?? { assignee: task.assignee, completed: false }
  }

  function handleClaim(taskId: string) {
    if (!claimUserId.trim()) return
    claimMutation.mutate(
      { taskId, userId: claimUserId.trim() },
      {
        onSuccess: () => {
          setTaskStates((prev) => {
            const next = new Map(prev)
            next.set(taskId, { assignee: claimUserId.trim(), completed: false })
            return next
          })
          setClaimingTaskId(null)
          setClaimUserId("")
        },
      },
    )
  }

  function handleUnclaim(taskId: string) {
    unclaimMutation.mutate(
      { taskId },
      {
        onSuccess: () => {
          setTaskStates((prev) => {
            const next = new Map(prev)
            next.set(taskId, { assignee: null, completed: false })
            return next
          })
        },
      },
    )
  }

  function handleComplete(taskId: string) {
    completeMutation.mutate(
      { taskId },
      {
        onSuccess: () => {
          setTaskStates((prev) => {
            const next = new Map(prev)
            const existing = next.get(taskId)
            next.set(taskId, { assignee: existing?.assignee ?? null, completed: true })
            return next
          })
        },
      },
    )
  }

  const isMutating =
    claimMutation.isPending || unclaimMutation.isPending || completeMutation.isPending
  const activeTasks = data.tasks.filter((t) => !getTaskState(t).completed)

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Open Tasks</h2>
        <Badge variant="secondary">{activeTasks.length} total</Badge>
      </div>

      {data.filters.assignee && (
        <p className="text-muted-foreground text-sm">
          Filtered by assignee: <strong>{data.filters.assignee}</strong>
        </p>
      )}

      {activeTasks.length === 0 ? (
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No tasks found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Process</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-40"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeTasks.map((task) => {
                const state = getTaskState(task)
                return (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div className="font-medium">{task.name ?? "Unnamed Task"}</div>
                      <div className="text-muted-foreground font-mono text-xs">
                        {task.taskDefinitionKey}
                      </div>
                    </TableCell>
                    <TableCell>
                      {state.assignee ? (
                        <span className="text-sm">{state.assignee}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm italic">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground font-mono text-xs">
                        {task.processDefinitionId.split(":")[0]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={task.priority} />
                    </TableCell>
                    <TableCell>
                      <TimeAgo date={task.created} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {claimingTaskId === task.id ? (
                          <form
                            className="flex items-center gap-1"
                            onSubmit={(e) => {
                              e.preventDefault()
                              handleClaim(task.id)
                            }}
                          >
                            <Input
                              className="h-7 w-24 text-xs"
                              placeholder="User ID"
                              value={claimUserId}
                              onChange={(e) => setClaimUserId(e.target.value)}
                              autoFocus
                            />
                            <Button variant="outline" size="sm" type="submit" disabled={isMutating}>
                              OK
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              type="button"
                              onClick={() => {
                                setClaimingTaskId(null)
                                setClaimUserId("")
                              }}
                            >
                              X
                            </Button>
                          </form>
                        ) : (
                          <>
                            {!state.assignee && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isMutating}
                                onClick={() => setClaimingTaskId(task.id)}
                              >
                                Claim
                              </Button>
                            )}
                            {state.assignee && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isMutating}
                                onClick={() => handleUnclaim(task.id)}
                              >
                                Unclaim
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isMutating}
                              onClick={() => handleComplete(task.id)}
                            >
                              Complete
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
