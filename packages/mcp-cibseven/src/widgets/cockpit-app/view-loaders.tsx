import type { ReactNode } from "react"
import { Alert, AlertDescription, useToolQuery } from "@miragon/mcp-toolkit-ui"
import type {
  DeploymentBrowserData,
  IncidentsDashboardData,
  InstanceDetailData,
  JobPanelData,
  ProcessDetailData,
  ProcessInstancesData,
  TaskDashboardData,
} from "@miragon-ai/client-cibseven"
import {
  CAMUNDA7_DEPLOYMENTS_DATA,
  CAMUNDA7_INCIDENTS_DATA,
  CAMUNDA7_INSTANCE_DETAIL_DATA,
  CAMUNDA7_JOBS_DATA,
  CAMUNDA7_PROCESS_DETAIL_DATA,
  CAMUNDA7_PROCESS_INSTANCES_DATA,
  CAMUNDA7_TASKS_DATA,
} from "../../tool-names.js"
import type { OnNavigate } from "../navigation.js"
import { ProcessHealthKpiView } from "../cockpit-dashboard/health-kpi.js"
import { ProcessDefinitionsTableView } from "../cockpit-dashboard/definitions-table.js"
import { IncidentOverviewKpiView } from "../incidents-dashboard/overview-kpi.js"
import { IncidentProcessListView } from "../incidents-dashboard/process-list.js"
import { ProcessDetailView } from "../process-detail.js"
import { ProcessInstancesView } from "../process-instances/list.js"
import { InstanceDetailWidget } from "../instance-detail.js"
import { TaskListTable } from "../task-dashboard/list-table.js"
import { JobPanelWidget } from "../job-panel.js"
import { DeploymentBrowserWidget } from "../deployment-browser.js"

/** Shared loading/error wrapper for a client-side loaded view. */
function Loaded<T>({
  data,
  isError,
  error,
  children,
}: {
  data: T | undefined
  isError: boolean
  error: Error | null
  children: (d: T) => ReactNode
}) {
  if (data !== undefined) return <>{children(data)}</>
  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error?.message ?? "Failed to load."}</AlertDescription>
      </Alert>
    )
  }
  return <div className="text-muted-foreground p-6 text-sm">Loading…</div>
}

export function OverviewView({
  engineId,
  onNavigate,
}: {
  engineId: string
  onNavigate: OnNavigate
}) {
  // Each panel self-fetches under a shared query key (deduped to one call) so it
  // stays a self-contained, reusable widget instead of receiving a data blob.
  return (
    <div className="flex flex-col gap-6">
      <ProcessHealthKpiView engineId={engineId} onNavigate={onNavigate} />
      <ProcessDefinitionsTableView engineId={engineId} onNavigate={onNavigate} />
    </div>
  )
}

export function IncidentsLoader({
  engineId,
  onNavigate,
}: {
  engineId: string
  onNavigate: OnNavigate
}) {
  const q = useToolQuery<IncidentsDashboardData>(
    ["camunda7:incidents", engineId],
    CAMUNDA7_INCIDENTS_DATA,
    { engine: engineId },
  )
  return (
    <Loaded data={q.data} isError={q.isError} error={q.error}>
      {(d) => (
        <div className="flex flex-col gap-6">
          <IncidentOverviewKpiView data={d} />
          <IncidentProcessListView data={d} onNavigate={onNavigate} />
        </div>
      )}
    </Loaded>
  )
}

export function ProcessDetailLoader({
  processDefinitionKey,
  engineId,
  onNavigate,
}: {
  processDefinitionKey: string
  engineId: string
  onNavigate: OnNavigate
}) {
  const q = useToolQuery<ProcessDetailData>(
    ["camunda7:process-detail", engineId, processDefinitionKey],
    CAMUNDA7_PROCESS_DETAIL_DATA,
    { processDefinitionKey, engine: engineId },
  )
  return (
    <Loaded data={q.data} isError={q.isError} error={q.error}>
      {(d) => <ProcessDetailView data={d} onNavigate={onNavigate} />}
    </Loaded>
  )
}

export function ProcessInstancesLoader({
  processDefinitionKey,
  engineId,
  onNavigate,
}: {
  processDefinitionKey: string
  engineId: string
  onNavigate: OnNavigate
}) {
  const q = useToolQuery<ProcessInstancesData>(
    ["camunda7:process-instances", engineId, processDefinitionKey],
    CAMUNDA7_PROCESS_INSTANCES_DATA,
    { processDefinitionKey, engine: engineId },
  )
  return (
    <Loaded data={q.data} isError={q.isError} error={q.error}>
      {(d) => <ProcessInstancesView data={d} onNavigate={onNavigate} />}
    </Loaded>
  )
}

export function InstanceDetailLoader({
  processInstanceId,
  engineId,
}: {
  processInstanceId: string
  engineId: string
}) {
  const q = useToolQuery<InstanceDetailData>(
    ["camunda7:instance-detail", engineId, processInstanceId],
    CAMUNDA7_INSTANCE_DETAIL_DATA,
    { processInstanceId, engine: engineId },
  )
  return (
    <Loaded data={q.data} isError={q.isError} error={q.error}>
      {(d) => <InstanceDetailWidget data={d} />}
    </Loaded>
  )
}

export function TasksLoader({ engineId }: { engineId: string }) {
  const q = useToolQuery<TaskDashboardData>(["camunda7:tasks", engineId], CAMUNDA7_TASKS_DATA, {
    engine: engineId,
  })
  return (
    <Loaded data={q.data} isError={q.isError} error={q.error}>
      {(d) => <TaskListTable data={d} />}
    </Loaded>
  )
}

export function JobsLoader({ engineId }: { engineId: string }) {
  const q = useToolQuery<JobPanelData>(["camunda7:jobs", engineId], CAMUNDA7_JOBS_DATA, {
    engine: engineId,
  })
  return (
    <Loaded data={q.data} isError={q.isError} error={q.error}>
      {(d) => <JobPanelWidget data={d} />}
    </Loaded>
  )
}

export function DeploymentsLoader({ engineId }: { engineId: string }) {
  const q = useToolQuery<DeploymentBrowserData>(
    ["camunda7:deployments", engineId],
    CAMUNDA7_DEPLOYMENTS_DATA,
    { engine: engineId },
  )
  return (
    <Loaded data={q.data} isError={q.isError} error={q.error}>
      {(d) => <DeploymentBrowserWidget data={d} />}
    </Loaded>
  )
}
