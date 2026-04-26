import { useEffect, useRef, useState } from "react"
import {
  Alert,
  AlertDescription,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToolMutation,
} from "@miragon/mcp-toolkit-ui"

interface OtelSpan {
  TraceId: string
  SpanName: string
  ServiceName: string
  duration_ms: number
  StatusCode: string
  StatusMessage: string
}

interface TraceResponse {
  otelSpans?: OtelSpan[]
  otelSpansError?: string
}

function formatSpanDuration(ms: number | null | undefined): string {
  if (ms == null) return "—"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}min`
}

/**
 * Logs tab: shows OTEL spans for the incident's process instance via the
 * analytics MCP plugin (`analytics_trace_process_execution`). Fires the
 * call lazily when the tab is mounted (radix unmounts inactive tabs by
 * default). When the analytics plugin or ClickHouse is not available the
 * call errors out and we degrade to a friendly empty-state.
 */
export function LogsTab({ processInstanceId }: { processInstanceId: string }) {
  const traceMutation = useToolMutation("analytics_trace_process_execution")
  const [spans, setSpans] = useState<OtelSpan[] | null>(null)
  const [otelError, setOtelError] = useState<string | null>(null)
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current || !processInstanceId) return
    fired.current = true
    traceMutation.mutate(
      {
        processInstanceId,
        includeOtelSpans: true,
        includeActivityHistory: false,
        includeVariableChanges: false,
      },
      {
        onSuccess: (result) => {
          const r = result as TraceResponse
          setSpans(r.otelSpans ?? [])
          setOtelError(r.otelSpansError ?? null)
        },
      },
    )
  }, [processInstanceId, traceMutation])

  if (traceMutation.isPending) {
    return <p className="text-muted-foreground py-4 text-center text-sm">Loading OTEL traces…</p>
  }

  if (traceMutation.isError) {
    return (
      <Alert>
        <AlertDescription>
          Analytics module not available — no OTEL traces can be loaded for this instance.
        </AlertDescription>
      </Alert>
    )
  }

  if (otelError) {
    return (
      <Alert>
        <AlertDescription>{otelError}</AlertDescription>
      </Alert>
    )
  }

  if (!spans || spans.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        No OTEL spans recorded for this process instance
      </p>
    )
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Span</TableHead>
            <TableHead>Service</TableHead>
            <TableHead className="text-right">Duration</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {spans.map((span, i) => (
            <TableRow key={`${span.SpanName}-${span.TraceId}-${i}`}>
              <TableCell className="font-mono text-sm">{span.SpanName}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{span.ServiceName}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatSpanDuration(span.duration_ms)}
              </TableCell>
              <TableCell>
                <Badge variant={span.StatusCode === "ERROR" ? "destructive" : "secondary"}>
                  {span.StatusCode || "OK"}
                </Badge>
                {span.StatusMessage && (
                  <span className="text-muted-foreground ml-2 font-mono text-xs">
                    {span.StatusMessage}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
