import { useState } from "react"
import {
  Card,
  CardContent,
  Badge,
  Alert,
  AlertDescription,
  Button,
  useToolMutation,
} from "@miragon/mcp-toolkit-ui"
import type {
  OpsConsoleData,
  IncidentPanelData,
  JobPanelData,
  TaskDashboardData,
  InstanceDetailData,
} from "@miragon-ai/client-camunda7"
import { IncidentPanelWidget } from "./incident-panel.js"
import { JobPanelWidget } from "./job-panel.js"
import { TaskDashboardWidget } from "./task-dashboard.js"
import { InstanceDetailWidget } from "./instance-detail.js"

export type { OpsConsoleData }

type DrillDown =
  | { kind: "incidents"; data: IncidentPanelData }
  | { kind: "jobs"; data: JobPanelData }
  | { kind: "tasks"; data: TaskDashboardData }
  | { kind: "instance"; data: InstanceDetailData }
  | null

interface ToolResult<T> {
  widget: string
  data: T
}

function StatCard({
  label,
  value,
  variant,
}: {
  label: string
  value: number
  variant: "default" | "success" | "destructive" | "warning"
}) {
  const bg: Record<string, string> = {
    default: "bg-muted",
    success: "bg-success/10",
    destructive: "bg-destructive/10",
    warning: "bg-warning/10",
  }
  const text: Record<string, string> = {
    default: "text-foreground",
    success: "text-success-foreground",
    destructive: "text-destructive",
    warning: "text-warning-foreground",
  }
  return (
    <div className={`rounded-lg p-4 ${bg[variant]}`}>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className={`text-2xl font-bold ${text[variant]}`}>{value}</p>
    </div>
  )
}

export function OpsConsoleWidget({ data }: { data: OpsConsoleData | null }) {
  const [drillDown, setDrillDown] = useState<DrillDown>(null)

  const incidentMutation = useToolMutation<ToolResult<IncidentPanelData>>(
    "camunda7_show_incident_panel",
  )
  const jobMutation = useToolMutation<ToolResult<JobPanelData>>("camunda7_show_job_panel")
  const taskMutation = useToolMutation<ToolResult<TaskDashboardData>>(
    "camunda7_show_task_dashboard",
  )
  const instanceMutation = useToolMutation<ToolResult<InstanceDetailData>>(
    "camunda7_show_instance_detail",
  )

  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  const pending =
    incidentMutation.isPending ||
    jobMutation.isPending ||
    taskMutation.isPending ||
    instanceMutation.isPending

  const openIncidents = (processDefinitionKey?: string) =>
    incidentMutation.mutate(processDefinitionKey ? { processDefinitionKey } : {}, {
      onSuccess: (r) => setDrillDown({ kind: "incidents", data: r.data }),
    })
  const openJobs = () =>
    jobMutation.mutate(
      data.filters.processDefinitionKey
        ? { processDefinitionKey: data.filters.processDefinitionKey, failedOnly: true }
        : { failedOnly: true },
      { onSuccess: (r) => setDrillDown({ kind: "jobs", data: r.data }) },
    )
  const openTasks = () =>
    taskMutation.mutate(
      {
        assignee: data.filters.assignee ?? undefined,
        candidateGroup: data.filters.candidateGroup ?? undefined,
        processDefinitionKey: data.filters.processDefinitionKey ?? undefined,
      },
      { onSuccess: (r) => setDrillDown({ kind: "tasks", data: r.data }) },
    )
  const openInstance = (processInstanceId: string) =>
    instanceMutation.mutate(
      { processInstanceId },
      { onSuccess: (r) => setDrillDown({ kind: "instance", data: r.data }) },
    )

  if (drillDown) {
    return (
      <div className="bg-card text-card-foreground flex flex-col">
        <div className="border-border bg-muted flex items-center justify-between border-b px-6 py-3">
          <Button variant="ghost" size="sm" onClick={() => setDrillDown(null)}>
            ← Back to console
          </Button>
          <Badge variant="secondary">drill-down: {drillDown.kind}</Badge>
        </div>
        {drillDown.kind === "incidents" && <IncidentPanelWidget data={drillDown.data} />}
        {drillDown.kind === "jobs" && <JobPanelWidget data={drillDown.data} />}
        {drillDown.kind === "tasks" && <TaskDashboardWidget data={drillDown.data} />}
        {drillDown.kind === "instance" && <InstanceDetailWidget data={drillDown.data} />}
      </div>
    )
  }

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Operations Console</h2>
        <div className="flex gap-2">
          {data.filters.processDefinitionKey && (
            <Badge variant="secondary">{data.filters.processDefinitionKey}</Badge>
          )}
          {data.filters.assignee && <Badge variant="secondary">@{data.filters.assignee}</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Definitions" value={data.summary.totalDefinitions} variant="default" />
        <StatCard
          label="Running Instances"
          value={data.summary.totalRunningInstances}
          variant="success"
        />
        <StatCard label="Failed Jobs" value={data.summary.totalFailedJobs} variant="destructive" />
        <StatCard label="Incidents" value={data.summary.totalIncidents} variant="warning" />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-muted-foreground text-sm font-medium">
            Incidents by Definition (top 10)
          </h3>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => openIncidents()}>
            View all
          </Button>
        </div>
        {data.incidentGroups.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">No open incidents.</p>
        ) : (
          <div className="grid gap-2">
            {data.incidentGroups.map((group) => (
              <Card
                key={group.processDefinitionKey}
                className="border-destructive/30 gap-0 py-0 shadow-none"
              >
                <CardContent className="flex items-center justify-between p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {group.processDefinitionName ?? group.processDefinitionKey}
                    </p>
                    <p className="text-muted-foreground font-mono text-xs">
                      {group.processDefinitionKey}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">{group.incidentCount}</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => openIncidents(group.processDefinitionKey)}
                    >
                      Open
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-muted-foreground text-sm font-medium">Failed Jobs</h3>
          <Button variant="outline" size="sm" disabled={pending} onClick={openJobs}>
            View all
          </Button>
        </div>
        {data.failedJobs.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">No failed jobs.</p>
        ) : (
          <div className="grid gap-2">
            {data.failedJobs.slice(0, 10).map((job) => (
              <Card key={job.id} className="border-destructive/30 gap-0 py-0 shadow-none">
                <CardContent className="p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">retries: {job.retries}</Badge>
                      {job.processDefinitionKey && (
                        <span className="text-muted-foreground font-mono text-xs">
                          {job.processDefinitionKey}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => openInstance(job.processInstanceId)}
                    >
                      Instance
                    </Button>
                  </div>
                  {job.exceptionMessage && (
                    <p className="text-muted-foreground break-words font-mono text-xs">
                      {job.exceptionMessage}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-muted-foreground text-sm font-medium">Open User Tasks</h3>
          <Button variant="outline" size="sm" disabled={pending} onClick={openTasks}>
            View all
          </Button>
        </div>
        {data.openTasks.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">No open tasks.</p>
        ) : (
          <div className="grid gap-2">
            {data.openTasks.slice(0, 10).map((task) => (
              <Card key={task.id} className="gap-0 py-0 shadow-none">
                <CardContent className="flex items-center justify-between p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{task.name ?? task.id}</p>
                    <p className="text-muted-foreground text-xs">
                      {task.assignee ? `@${task.assignee}` : "unassigned"} · priority{" "}
                      {task.priority} · {new Date(task.created).toLocaleDateString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
