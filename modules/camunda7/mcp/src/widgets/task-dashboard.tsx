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
} from "@miragon/mcp-toolkit-ui"

interface TaskData {
  id: string
  name: string | null
  assignee: string | null
  created: string
  due: string | null
  priority: number
  processDefinitionId: string
  processInstanceId: string
  taskDefinitionKey: string
  description: string | null
}

export interface TaskDashboardData {
  tasks: TaskData[]
  totalCount: number
  filters: {
    assignee?: string
    candidateGroup?: string
    processDefinitionKey?: string
  }
}

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
    <span className="text-sm text-muted-foreground" title={then.toLocaleString()}>
      {text}
    </span>
  )
}

export function TaskDashboardWidget({ data }: { data: TaskDashboardData | null }) {
  if (!data) {
    return (
      <div className="p-6 bg-card text-card-foreground">
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-6 bg-card text-card-foreground">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Open Tasks</h2>
        <Badge variant="secondary">{data.totalCount} total</Badge>
      </div>

      {data.filters.assignee && (
        <p className="text-sm text-muted-foreground">
          Filtered by assignee: <strong>{data.filters.assignee}</strong>
        </p>
      )}

      {data.tasks.length === 0 ? (
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <div className="font-medium">{task.name ?? "Unnamed Task"}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {task.taskDefinitionKey}
                    </div>
                  </TableCell>
                  <TableCell>
                    {task.assignee ? (
                      <span className="text-sm">{task.assignee}</span>
                    ) : (
                      <span className="text-sm italic text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono text-muted-foreground">
                      {task.processDefinitionId.split(":")[0]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={task.priority} />
                  </TableCell>
                  <TableCell>
                    <TimeAgo date={task.created} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
