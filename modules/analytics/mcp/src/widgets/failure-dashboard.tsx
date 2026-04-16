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
  useToolMutation,
} from "@miragon/mcp-toolkit-ui"
import type { FailureDashboardData } from "@automation-mcp/client-analytics"

export type { FailureDashboardData }

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function truncate(s: string, max: number): string {
  if (!s) return "\u2014"
  return s.length > max ? s.slice(0, max) + "\u2026" : s
}

const PERIODS = ["1d", "7d", "30d", "90d"] as const

export function FailureDashboardWidget({
  data: initialData,
}: {
  data: FailureDashboardData | null
}) {
  const [data, setData] = useState<FailureDashboardData | null>(initialData)
  const [activePeriod, setActivePeriod] = useState(initialData?.period ?? "7d")
  const refreshMutation = useToolMutation("analytics_show_failure_dashboard")

  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  function handlePeriodChange(period: string) {
    setActivePeriod(period)
    refreshMutation.mutate(
      { period },
      {
        onSuccess: (result) => {
          const parsed = result as { data?: FailureDashboardData } & FailureDashboardData
          setData(parsed.data ?? parsed)
        },
      },
    )
  }

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Failure Analysis</h2>
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <Button
              key={p}
              variant={activePeriod === p ? "default" : "outline"}
              size="sm"
              disabled={refreshMutation.isPending}
              onClick={() => handlePeriodChange(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm font-medium">Total Incidents</p>
            <p className="text-destructive text-2xl font-bold">{data.totalIncidents}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm font-medium">Unique Error Patterns</p>
            <p className="text-2xl font-bold">{data.uniqueErrorPatterns}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm font-medium">Most Affected</p>
            <p className="truncate font-mono text-lg font-bold">
              {data.mostAffectedProcess ?? "\u2014"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Error Patterns */}
      {data.errorPatterns.length > 0 && (
        <details open>
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <svg
              className="text-muted-foreground size-4 shrink-0 transition-transform [[open]>&]:rotate-90"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
            </svg>
            <h3 className="text-lg font-medium">Error Patterns</h3>
            <Badge variant="destructive">{data.errorPatterns.length}</Badge>
          </summary>
          <div className="mt-3 rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Error</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Process</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead>First Seen</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.errorPatterns.map((pattern, i) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-xs">
                      <details>
                        <summary className="text-destructive cursor-pointer text-sm">
                          {truncate(pattern.incidentMessage, 60)}
                        </summary>
                        <pre className="bg-muted mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded p-2 text-xs">
                          {pattern.incidentMessage}
                        </pre>
                        {pattern.sampleInstanceIds.length > 0 && (
                          <div className="text-muted-foreground mt-1 text-xs">
                            Sample IDs:{" "}
                            {pattern.sampleInstanceIds.map((id) => id.slice(0, 8)).join(", ")}
                          </div>
                        )}
                      </details>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{pattern.activityId}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {pattern.processDefinitionKey}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="destructive">{pattern.incidentCount}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(pattern.firstOccurrence)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(pattern.lastOccurrence)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      )}

      {/* Per-Process Breakdown */}
      {data.processBreakdown.length > 0 && (
        <details open>
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <svg
              className="text-muted-foreground size-4 shrink-0 transition-transform [[open]>&]:rotate-90"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
            </svg>
            <h3 className="text-lg font-medium">Failures by Process</h3>
            <Badge variant="secondary">{data.processBreakdown.length}</Badge>
          </summary>
          <div className="mt-3 rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Process</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Incidents</TableHead>
                  <TableHead>Failure Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.processBreakdown.map((proc) => (
                  <TableRow key={proc.processDefinitionKey}>
                    <TableCell className="font-mono text-sm font-medium">
                      {proc.processDefinitionKey}
                    </TableCell>
                    <TableCell className="text-right">{proc.totalInstances}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="destructive">{proc.failedCount}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{proc.incidentCount}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="bg-muted h-2 w-24 overflow-hidden rounded-full">
                          <div
                            className="bg-destructive h-full rounded-full"
                            style={{ width: `${Math.min(100, proc.failureRatePct)}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {proc.failureRatePct}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      )}

      {data.errorPatterns.length === 0 && data.processBreakdown.length === 0 && (
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No failures found in the selected period</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
