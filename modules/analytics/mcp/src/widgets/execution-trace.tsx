import { useState } from "react"
import {
  Card,
  CardContent,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Alert,
  AlertDescription,
  Button,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  useToolMutation,
} from "@miragon/mcp-toolkit-ui"
import type {
  ExecutionTraceData,
  ActivityHistoryItem,
  VariableChangeItem,
  OtelSpanItem,
} from "@miragon-ai/client-analytics"

export type { ExecutionTraceData }

type TraceData = NonNullable<ExecutionTraceData["trace"]>

function formatDuration(ms: number | null): string {
  if (ms == null) return "\u2014"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}min`
  return `${(ms / 3600000).toFixed(1)}h`
}

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

const ACTIVITY_COLORS: Record<string, string> = {
  startEvent: "bg-green-500/10 text-green-700",
  endEvent: "bg-slate-500/10 text-slate-700",
  userTask: "bg-blue-500/10 text-blue-700",
  serviceTask: "bg-purple-500/10 text-purple-700",
  sendTask: "bg-purple-500/10 text-purple-700",
  receiveTask: "bg-orange-500/10 text-orange-700",
  exclusiveGateway: "bg-yellow-500/10 text-yellow-700",
  parallelGateway: "bg-yellow-500/10 text-yellow-700",
  inclusiveGateway: "bg-yellow-500/10 text-yellow-700",
  callActivity: "bg-indigo-500/10 text-indigo-700",
  subProcess: "bg-indigo-500/10 text-indigo-700",
}

function getVariableDisplayValue(item: VariableChangeItem): string {
  if (item.text_value !== null && item.text_value !== undefined) return item.text_value
  if (item.long_value !== null && item.long_value !== undefined) return String(item.long_value)
  if (item.double_value !== null && item.double_value !== undefined)
    return String(item.double_value)
  return "\u2014"
}

function ActivitiesTab({ activities }: { activities: ActivityHistoryItem[] }) {
  const maxDuration = Math.max(
    ...activities.map((a) => a.duration_in_millis ?? 0).filter((d) => d > 0),
    1,
  )

  const totalDuration = activities.reduce((s, a) => s + (a.duration_in_millis ?? 0), 0)
  const longest = activities.reduce(
    (max, a) => ((a.duration_in_millis ?? 0) > (max.duration_in_millis ?? 0) ? a : max),
    activities[0],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-3">
            <p className="text-muted-foreground text-xs">Total Activities</p>
            <p className="text-lg font-bold">{activities.length}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-3">
            <p className="text-muted-foreground text-xs">Longest Activity</p>
            <p className="truncate font-mono text-sm font-bold">
              {longest?.activity_name ?? longest?.activity_id ?? "\u2014"}{" "}
              <span className="text-muted-foreground font-normal">
                ({formatDuration(longest?.duration_in_millis ?? null)})
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        {activities.map((act, i) => (
          <Card key={`${act.activity_id}-${i}`} className="gap-0 py-0 shadow-none">
            <CardContent className="flex flex-col gap-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={ACTIVITY_COLORS[act.activity_type] ?? ""}>
                    {act.activity_type}
                  </Badge>
                  <span className="text-sm font-medium">
                    {act.activity_name ?? act.activity_id}
                  </span>
                  {act.assignee && (
                    <span className="text-muted-foreground text-xs">({act.assignee})</span>
                  )}
                </div>
                <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
                  {formatDuration(act.duration_in_millis)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(1, ((act.duration_in_millis ?? 0) / maxDuration) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-muted-foreground w-12 text-right text-xs tabular-nums">
                  {totalDuration > 0
                    ? `${(((act.duration_in_millis ?? 0) / totalDuration) * 100).toFixed(0)}%`
                    : ""}
                </span>
              </div>
              <div className="text-muted-foreground flex gap-4 text-xs">
                <span>Start: {formatDate(act.start_time)}</span>
                <span>End: {formatDate(act.end_time)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function VariablesTab({ variables }: { variables: VariableChangeItem[] }) {
  if (variables.length === 0) {
    return <p className="text-muted-foreground py-4 text-center text-sm">No variable changes</p>
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Variable</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Value</TableHead>
            <TableHead className="text-right">Rev</TableHead>
            <TableHead>Timestamp</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {variables.map((v, i) => (
            <TableRow key={`${v.variable_name}-${v.revision}-${i}`}>
              <TableCell className="font-mono text-sm font-medium">{v.variable_name}</TableCell>
              <TableCell className="text-muted-foreground text-xs">{v.variable_type}</TableCell>
              <TableCell className="max-w-xs truncate font-mono text-xs">
                {getVariableDisplayValue(v)}
              </TableCell>
              <TableCell className="text-right">
                <Badge variant="secondary" className="tabular-nums">
                  {v.revision}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {formatDate(v.timestamp)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function OtelTab({ spans, error }: { spans: OtelSpanItem[]; error?: string }) {
  if (error) {
    return (
      <Alert>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (spans.length === 0) {
    return <p className="text-muted-foreground py-4 text-center text-sm">No OTEL spans found</p>
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Span Name</TableHead>
            <TableHead>Service</TableHead>
            <TableHead className="text-right">Duration</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {spans.map((span, i) => (
            <TableRow key={`${span.SpanName}-${i}`}>
              <TableCell className="font-mono text-sm">{span.SpanName}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{span.ServiceName}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatDuration(span.duration_ms)}
              </TableCell>
              <TableCell>
                <Badge variant={span.StatusCode === "ERROR" ? "destructive" : "secondary"}>
                  {span.StatusCode || "OK"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function ExecutionTraceWidget({ data: initialData }: { data: ExecutionTraceData | null }) {
  const [processInstanceId, setProcessInstanceId] = useState(initialData?.processInstanceId ?? "")
  const [trace, setTrace] = useState<TraceData | null>(initialData?.trace ?? null)
  const traceMutation = useToolMutation("analytics_trace_process_execution")

  function handleTrace(e: React.FormEvent) {
    e.preventDefault()
    if (!processInstanceId.trim()) return

    traceMutation.mutate(
      {
        processInstanceId: processInstanceId.trim(),
        includeActivityHistory: true,
        includeVariableChanges: true,
        includeOtelSpans: true,
      },
      {
        onSuccess: (result) => {
          setTrace(result as TraceData)
        },
      },
    )
  }

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-6 p-6">
      <h2 className="text-xl font-semibold">Execution Trace</h2>

      <form onSubmit={handleTrace} className="flex items-end gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-muted-foreground text-xs font-medium">Process Instance ID</label>
          <Input
            placeholder="Enter process instance ID"
            value={processInstanceId}
            onChange={(e) => setProcessInstanceId(e.target.value)}
            required
            className="font-mono"
          />
        </div>
        <Button type="submit" disabled={traceMutation.isPending}>
          {traceMutation.isPending ? "Tracing\u2026" : "Trace"}
        </Button>
      </form>

      {traceMutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Trace failed: {traceMutation.error?.message ?? "Unknown error"}
          </AlertDescription>
        </Alert>
      )}

      {!trace && !traceMutation.isPending && (
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">
              Enter a process instance ID to trace its execution
            </p>
          </CardContent>
        </Card>
      )}

      {trace && (
        <Tabs defaultValue="activities">
          <TabsList>
            <TabsTrigger value="activities">
              Activities
              {trace.activityHistory && (
                <Badge variant="secondary" className="ml-1">
                  {trace.activityHistory.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="variables">
              Variables
              {trace.variableChanges && (
                <Badge variant="secondary" className="ml-1">
                  {trace.variableChanges.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="otel">
              OTEL Spans
              {trace.otelSpans && (
                <Badge variant="secondary" className="ml-1">
                  {trace.otelSpans.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="activities">
            {trace.activityHistory && trace.activityHistory.length > 0 ? (
              <ActivitiesTab activities={trace.activityHistory} />
            ) : (
              <p className="text-muted-foreground py-4 text-center text-sm">No activity history</p>
            )}
          </TabsContent>

          <TabsContent value="variables">
            <VariablesTab variables={trace.variableChanges ?? []} />
          </TabsContent>

          <TabsContent value="otel">
            <OtelTab spans={trace.otelSpans ?? []} error={trace.otelSpansError} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
