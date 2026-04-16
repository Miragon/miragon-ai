import { useState } from "react"
import {
  Card,
  CardContent,
  Badge,
  Alert,
  AlertDescription,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  useToolMutation,
} from "@miragon/mcp-toolkit-ui"

import type { JobPanelData } from "@automation-mcp/client-camunda7"

export type { JobPanelData }

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function truncate(s: string | null, max: number): string {
  if (!s) return "\u2014"
  return s.length > max ? s.slice(0, max) + "\u2026" : s
}

export function JobPanelWidget({ data }: { data: JobPanelData | null }) {
  const [retriedIds, setRetriedIds] = useState<Set<string>>(new Set())
  const retryMutation = useToolMutation("camunda7_set_job_retries")

  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  const { totalCount, failedCount, jobs } = data

  function handleRetry(jobId: string) {
    retryMutation.mutate(
      { jobId, retries: 1 },
      { onSuccess: () => setRetriedIds((prev) => new Set(prev).add(jobId)) },
    )
  }

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Job Management</h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{totalCount} total</Badge>
          {failedCount > 0 && <Badge variant="destructive">{failedCount} failed</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="bg-muted rounded-lg p-4">
          <p className="text-muted-foreground text-sm">Total Jobs</p>
          <p className="text-2xl font-bold">{totalCount}</p>
        </div>
        <div className="rounded-lg bg-red-500/10 p-4">
          <p className="text-muted-foreground text-sm">Failed (no retries)</p>
          <p className="text-destructive text-2xl font-bold">{failedCount}</p>
        </div>
        <div className="rounded-lg bg-green-500/10 p-4">
          <p className="text-muted-foreground text-sm">Healthy</p>
          <p className="text-success-foreground text-2xl font-bold">{totalCount - failedCount}</p>
        </div>
      </div>

      {jobs.length > 0 && (
        <details open={jobs.length <= 20}>
          <summary className="text-muted-foreground mb-2 cursor-pointer text-sm font-medium">
            Jobs ({jobs.length})
          </summary>
          <Card className="gap-0 overflow-hidden py-0 shadow-none">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity</TableHead>
                    <TableHead>Process</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => {
                    const retried = retriedIds.has(job.id)
                    return (
                      <TableRow key={job.id} className={retried ? "opacity-50" : ""}>
                        <TableCell>
                          <span className="font-mono text-sm">{job.activityId ?? "\u2014"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">
                            {job.processDefinitionKey ?? "\u2014"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              retried
                                ? "secondary"
                                : job.retries === 0
                                  ? "destructive"
                                  : "secondary"
                            }
                            className="tabular-nums"
                          >
                            {retried ? 1 : job.retries}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {job.exceptionMessage ? (
                            <details>
                              <summary className="text-destructive cursor-pointer text-sm">
                                {truncate(job.exceptionMessage, 50)}
                              </summary>
                              <pre className="bg-muted mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded p-2 text-xs">
                                {job.exceptionMessage}
                              </pre>
                            </details>
                          ) : (
                            <span className="text-muted-foreground text-sm">{"\u2014"}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(job.createTime)}
                        </TableCell>
                        <TableCell>
                          {job.retries === 0 && !retried && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={retryMutation.isPending}
                              onClick={() => handleRetry(job.id)}
                            >
                              Retry
                            </Button>
                          )}
                          {retried && (
                            <span className="text-muted-foreground text-xs">Retried</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </details>
      )}

      {jobs.length === 0 && (
        <p className="text-muted-foreground py-4 text-center text-sm">No jobs found</p>
      )}
    </div>
  )
}
