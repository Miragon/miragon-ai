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
  DeveloperWorkbenchData,
  BpmnViewerData,
  InstanceDetailData,
  HistoryTimelineData,
  JobPanelData,
} from "@miragon-ai/client-camunda7"
import { BpmnViewerWidget } from "./bpmn-viewer.js"
import { InstanceDetailWidget } from "./instance-detail.js"
import { HistoryTimelineWidget } from "./history-timeline.js"
import { JobPanelWidget } from "./job-panel.js"

export type { DeveloperWorkbenchData }

type DrillDown =
  | { kind: "bpmn"; data: BpmnViewerData }
  | { kind: "instance"; data: InstanceDetailData }
  | { kind: "history"; data: HistoryTimelineData }
  | { kind: "jobs"; data: JobPanelData }
  | null

interface ToolResult<T> {
  widget: string
  data: T
}

export function DeveloperWorkbenchWidget({ data }: { data: DeveloperWorkbenchData | null }) {
  const [drillDown, setDrillDown] = useState<DrillDown>(null)

  const bpmnMutation = useToolMutation<ToolResult<BpmnViewerData>>("camunda7_show_bpmn_viewer")
  const instanceMutation = useToolMutation<ToolResult<InstanceDetailData>>(
    "camunda7_show_instance_detail",
  )
  const historyMutation = useToolMutation<ToolResult<HistoryTimelineData>>(
    "camunda7_show_history_timeline",
  )
  const jobsMutation = useToolMutation<ToolResult<JobPanelData>>("camunda7_show_job_panel")

  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  const openBpmn = (processInstanceId: string) =>
    bpmnMutation.mutate(
      { processInstanceId },
      { onSuccess: (r) => setDrillDown({ kind: "bpmn", data: r.data }) },
    )
  const openInstance = (processInstanceId: string) =>
    instanceMutation.mutate(
      { processInstanceId },
      { onSuccess: (r) => setDrillDown({ kind: "instance", data: r.data }) },
    )
  const openHistory = (processInstanceId: string) =>
    historyMutation.mutate(
      { processInstanceId },
      { onSuccess: (r) => setDrillDown({ kind: "history", data: r.data }) },
    )
  const openJobs = (processDefinitionKey: string) =>
    jobsMutation.mutate(
      { processDefinitionKey, failedOnly: true },
      { onSuccess: (r) => setDrillDown({ kind: "jobs", data: r.data }) },
    )

  const mutationPending =
    bpmnMutation.isPending ||
    instanceMutation.isPending ||
    historyMutation.isPending ||
    jobsMutation.isPending

  if (drillDown) {
    return (
      <div className="bg-card text-card-foreground flex flex-col">
        <div className="border-border bg-muted flex items-center justify-between border-b px-6 py-3">
          <Button variant="ghost" size="sm" onClick={() => setDrillDown(null)}>
            ← Back to workbench
          </Button>
          <Badge variant="secondary">drill-down: {drillDown.kind}</Badge>
        </div>
        {drillDown.kind === "bpmn" && <BpmnViewerWidget data={drillDown.data} />}
        {drillDown.kind === "instance" && <InstanceDetailWidget data={drillDown.data} />}
        {drillDown.kind === "history" && <HistoryTimelineWidget data={drillDown.data} />}
        {drillDown.kind === "jobs" && <JobPanelWidget data={drillDown.data} />}
      </div>
    )
  }

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Developer Workbench</h2>
          {data.focus.processDefinitionKey && (
            <p className="text-muted-foreground font-mono text-sm">
              focused on {data.focus.processDefinitionKey}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">{data.definitions.length} definitions</Badge>
          <Badge variant={data.totalIncidents > 0 ? "destructive" : "secondary"}>
            {data.totalIncidents} incidents
          </Badge>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-muted-foreground text-sm font-medium">Process Definitions</h3>
        {data.definitions.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">No definitions deployed.</p>
        ) : (
          <div className="grid gap-2">
            {data.definitions.slice(0, 10).map((def) => (
              <Card key={def.id} className="gap-0 py-0 shadow-none">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium">{def.name ?? def.key}</h4>
                    <p className="text-muted-foreground font-mono text-sm">
                      {def.key} · v{def.version}
                      {def.versionTag && ` · ${def.versionTag}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {def.suspended && <Badge variant="secondary">suspended</Badge>}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={mutationPending}
                      onClick={() => openJobs(def.key)}
                    >
                      Failed jobs
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-muted-foreground text-sm font-medium">Recent Deployments</h3>
        {data.recentDeployments.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">No recent deployments.</p>
        ) : (
          <div className="grid gap-2">
            {data.recentDeployments.map((dep) => (
              <Card key={dep.id} className="gap-0 py-0 shadow-none">
                <CardContent className="flex items-center justify-between p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{dep.name ?? dep.id}</p>
                    <p className="text-muted-foreground text-xs">
                      {dep.deploymentTime && new Date(dep.deploymentTime).toLocaleString()}
                      {dep.source && ` · ${dep.source}`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-muted-foreground text-sm font-medium">Active Incidents</h3>
          <Badge variant={data.incidents.length > 0 ? "destructive" : "secondary"}>
            {data.incidents.length}
          </Badge>
        </div>
        {data.incidents.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">No active incidents.</p>
        ) : (
          <div className="grid gap-2">
            {data.incidents.slice(0, 10).map((inc) => (
              <Card key={inc.id} className="border-destructive/30 gap-0 py-0 shadow-none">
                <CardContent className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="destructive">{inc.incidentType}</Badge>
                      <span className="text-muted-foreground text-xs">
                        {new Date(inc.incidentTimestamp).toLocaleString()}
                      </span>
                    </div>
                    {inc.incidentMessage && (
                      <p className="text-muted-foreground break-words font-mono text-sm">
                        {inc.incidentMessage}
                      </p>
                    )}
                    <p className="text-muted-foreground mt-1 text-xs">
                      activity <code>{inc.activityId}</code> · instance{" "}
                      <code>{inc.processInstanceId.slice(0, 8)}…</code>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={mutationPending}
                      onClick={() => openInstance(inc.processInstanceId)}
                    >
                      Instance
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={mutationPending}
                      onClick={() => openBpmn(inc.processInstanceId)}
                    >
                      BPMN
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={mutationPending}
                      onClick={() => openHistory(inc.processInstanceId)}
                    >
                      History
                    </Button>
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
