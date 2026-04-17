import { useState } from "react"
import {
  Card,
  CardContent,
  Badge,
  Alert,
  AlertDescription,
  Button,
  Input,
  Label,
  useToolMutation,
} from "@miragon/mcp-toolkit-ui"
import type {
  AnalystCockpitData,
  AnalyticsDashboardData,
  FailureDashboardData,
  ExecutionTraceData,
  VariableSearchData,
} from "@miragon-ai/client-analytics"
import { AnalyticsDashboardWidget } from "./analytics-dashboard.js"
import { FailureDashboardWidget } from "./failure-dashboard.js"
import { ExecutionTraceWidget } from "./execution-trace.js"
import { VariableSearchWidget } from "./variable-search.js"

export type { AnalystCockpitData }

type DrillDown =
  | { kind: "dashboard"; data: AnalyticsDashboardData }
  | { kind: "failures"; data: FailureDashboardData }
  | { kind: "trace"; data: ExecutionTraceData }
  | { kind: "variable-search"; data: VariableSearchData }
  | null

interface ToolResult<T> {
  widget: string
  data: T
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "-"
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}min`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

function KpiCard({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string | number
  tone?: "default" | "destructive" | "warning" | "success"
}) {
  const bg: Record<string, string> = {
    default: "bg-muted",
    destructive: "bg-destructive/10",
    warning: "bg-warning/10",
    success: "bg-success/10",
  }
  const color: Record<string, string> = {
    default: "text-foreground",
    destructive: "text-destructive",
    warning: "text-warning-foreground",
    success: "text-success-foreground",
  }
  return (
    <div className={`rounded-lg p-4 ${bg[tone]}`}>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className={`text-2xl font-bold ${color[tone]}`}>{value}</p>
    </div>
  )
}

export function AnalystCockpitWidget({ data }: { data: AnalystCockpitData | null }) {
  const [drillDown, setDrillDown] = useState<DrillDown>(null)
  const [traceInstanceId, setTraceInstanceId] = useState("")

  const dashboardMutation = useToolMutation<ToolResult<AnalyticsDashboardData>>(
    "analytics_show_dashboard",
  )
  const failureMutation = useToolMutation<ToolResult<FailureDashboardData>>(
    "analytics_show_failure_dashboard",
  )
  const traceMutation = useToolMutation<ToolResult<ExecutionTraceData>>(
    "analytics_show_execution_trace",
  )
  const varSearchMutation = useToolMutation<ToolResult<VariableSearchData>>(
    "analytics_show_variable_search",
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
    dashboardMutation.isPending ||
    failureMutation.isPending ||
    traceMutation.isPending ||
    varSearchMutation.isPending

  const openDashboard = () =>
    dashboardMutation.mutate(
      {
        period: data.period,
        ...(data.processDefinitionKey ? { processDefinitionKey: data.processDefinitionKey } : {}),
      },
      { onSuccess: (r) => setDrillDown({ kind: "dashboard", data: r.data }) },
    )
  const openFailures = () =>
    failureMutation.mutate(
      { period: data.period },
      { onSuccess: (r) => setDrillDown({ kind: "failures", data: r.data }) },
    )
  const openTrace = (processInstanceId: string) =>
    traceMutation.mutate(
      { processInstanceId },
      { onSuccess: (r) => setDrillDown({ kind: "trace", data: r.data }) },
    )
  const openVariableSearch = () =>
    varSearchMutation.mutate(
      data.processDefinitionKey ? { processDefinitionKey: data.processDefinitionKey } : {},
      { onSuccess: (r) => setDrillDown({ kind: "variable-search", data: r.data }) },
    )

  if (drillDown) {
    return (
      <div className="bg-card text-card-foreground flex flex-col">
        <div className="border-border bg-muted flex items-center justify-between border-b px-6 py-3">
          <Button variant="ghost" size="sm" onClick={() => setDrillDown(null)}>
            ← Back to cockpit
          </Button>
          <Badge variant="secondary">drill-down: {drillDown.kind}</Badge>
        </div>
        {drillDown.kind === "dashboard" && <AnalyticsDashboardWidget data={drillDown.data} />}
        {drillDown.kind === "failures" && <FailureDashboardWidget data={drillDown.data} />}
        {drillDown.kind === "trace" && <ExecutionTraceWidget data={drillDown.data} />}
        {drillDown.kind === "variable-search" && <VariableSearchWidget data={drillDown.data} />}
      </div>
    )
  }

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Analyst Cockpit</h2>
          <p className="text-muted-foreground text-sm">
            window: {data.period}
            {data.processDefinitionKey && ` · ${data.processDefinitionKey}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={openDashboard}>
            Full dashboard
          </Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={openFailures}>
            Failures
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <KpiCard label="Instances" value={data.kpis.totalInstances} />
        <KpiCard label="Failed" value={data.kpis.failedInstances} tone="destructive" />
        <KpiCard
          label="Failure rate"
          value={`${data.kpis.failureRatePct}%`}
          tone={data.kpis.failureRatePct > 5 ? "destructive" : "warning"}
        />
        <KpiCard label="p50 duration" value={formatDuration(data.kpis.medianDurationMs)} />
        <KpiCard label="p95 duration" value={formatDuration(data.kpis.p95DurationMs)} />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-muted-foreground text-sm font-medium">Top Error Patterns</h3>
        {data.errorPatterns.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">No incidents in this window.</p>
        ) : (
          <div className="grid gap-2">
            {data.errorPatterns.map((e, idx) => (
              <Card
                key={`${e.activityId}-${idx}`}
                className="border-destructive/30 gap-0 py-0 shadow-none"
              >
                <CardContent className="flex items-start justify-between gap-4 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="destructive">{e.incidentCount}</Badge>
                      <span className="text-muted-foreground font-mono text-xs">
                        {e.processDefinitionKey} · {e.activityId}
                      </span>
                    </div>
                    <p className="text-muted-foreground break-words font-mono text-xs">
                      {e.incidentMessage || "(no message)"}
                    </p>
                  </div>
                  {e.sampleInstanceIds[0] && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => openTrace(e.sampleInstanceIds[0])}
                    >
                      Trace
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-muted-foreground text-sm font-medium">Activity Bottlenecks</h3>
        {data.bottlenecks.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">No activity data in this window.</p>
        ) : (
          <div className="grid gap-2">
            {data.bottlenecks.map((b, idx) => (
              <Card key={`${b.activityId}-${idx}`} className="gap-0 py-0 shadow-none">
                <CardContent className="flex items-center justify-between gap-4 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{b.activityName || b.activityId}</p>
                    <p className="text-muted-foreground font-mono text-xs">
                      {b.activityId} · {b.activityType} · {b.executionCount} runs
                    </p>
                  </div>
                  <div className="flex flex-col items-end text-xs">
                    <span className="text-muted-foreground">
                      p95 {formatDuration(b.p95DurationMs)}
                    </span>
                    <span className="font-mono font-medium">
                      total {formatDuration(b.totalTimeMs)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-muted-foreground text-sm font-medium">Trace a specific instance</h3>
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="trace-pid" className="text-muted-foreground text-xs">
                Process instance ID
              </Label>
              <Input
                id="trace-pid"
                value={traceInstanceId}
                onChange={(e) => setTraceInstanceId(e.target.value)}
                placeholder="e.g. 2b1f…"
                className="font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={pending || !traceInstanceId.trim()}
                onClick={() => openTrace(traceInstanceId.trim())}
              >
                Open trace
              </Button>
              <Button variant="outline" disabled={pending} onClick={openVariableSearch}>
                Variable search
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
