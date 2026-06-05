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

import type { JobPanelData } from "@miragon-ai/client-cibseven"
import { AskAiButton } from "@miragon-ai/widget-shell/widgets"
import { CAMUNDA7_JOBS_DATA } from "../tool-names.js"
import { useViewData } from "./use-view-data.js"
import { ConfirmDialog } from "./confirm-dialog.js"
import { refreshCockpitData } from "./refresh.js"

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

export function JobPanelWidget({
  data: initialData = null,
  engine,
}: {
  data?: JobPanelData | null
  engine?: string
}) {
  const [retriedIds, setRetriedIds] = useState<Set<string>>(new Set())
  const [confirmBatch, setConfirmBatch] = useState(false)
  const retryMutation = useToolMutation("camunda7_set_job_retries")
  const batchMutation = useToolMutation("camunda7_set_job_retries_batch")
  const { data, loading, error } = useViewData<JobPanelData>(
    initialData,
    ["camunda7:jobs", engine ?? null],
    CAMUNDA7_JOBS_DATA,
    { engine },
    !!engine,
  )

  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : (
          <div className="text-muted-foreground text-sm">
            {loading ? "Loading…" : "No data available"}
          </div>
        )}
      </div>
    )
  }

  const { totalCount, failedCount, jobs } = data
  const failedJobs = jobs.filter((j) => j.retries === 0 && !retriedIds.has(j.id))

  function handleRetry(jobId: string) {
    retryMutation.mutate(
      { jobId, retries: 1 },
      {
        onSuccess: () => {
          setRetriedIds((prev) => new Set(prev).add(jobId))
          refreshCockpitData()
        },
      },
    )
  }

  function handleBatchRetry() {
    const jobIds = failedJobs.map((j) => j.id)
    if (jobIds.length === 0) return
    batchMutation.mutate(
      { jobIds, retries: 1 },
      {
        onSuccess: () => {
          setRetriedIds((prev) => {
            const next = new Set(prev)
            jobIds.forEach((id) => next.add(id))
            return next
          })
          setConfirmBatch(false)
          refreshCockpitData()
        },
      },
    )
  }

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">Job Management</h2>
          <Badge variant="secondary">{totalCount} total</Badge>
          {failedCount > 0 && <Badge variant="destructive">{failedCount} failed</Badge>}
        </div>
        {failedJobs.length > 0 && (
          <AskAiButton
            variant="primary"
            prompt={`Triage the failed jobs (retries == 0) on engine "${engine}" surfaced in the Job Management panel. The engine reports ${totalCount} total jobs and ${failedCount} failed. Use camunda7_list_jobs({engine: "${engine}", withException: true, noRetriesLeft: true}) to load the exact failed set, then: (1) cluster the jobs by normalized exceptionMessage and by activityId/processDefinitionKey; (2) for each cluster name the most likely root cause, cross-checking with camunda7_list_incidents({engine: "${engine}"}) and camunda7_query_historic_activity_instances to see whether the same activity is failing across many instances (systemic) or one-off; (3) recommend a concrete action per cluster — transient/infra errors -> batch retry via camunda7_set_job_retries_batch, bad input data -> camunda7_set_process_instance_variable then retry, code/deployment defect -> escalate and draft a ticket. Return a short ranked table: cluster | likely cause | affected count | recommended action. Do not execute any retry or mutation; recommend only.`}
          />
        )}
      </div>
      {failedJobs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={batchMutation.isPending}
            onClick={() => setConfirmBatch(true)}
          >
            Retry all failed
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Job summary">
        <div className="bg-muted rounded-lg p-4">
          <p className="text-muted-foreground text-sm">Total Jobs</p>
          <p className="text-2xl font-bold">{totalCount}</p>
        </div>
        <div className="bg-critical-soft rounded-lg p-4">
          <p className="text-muted-foreground text-sm">Failed (no retries)</p>
          <p className="text-critical text-2xl font-bold">{failedCount}</p>
        </div>
        <div className="bg-m-green-soft rounded-lg p-4">
          <p className="text-muted-foreground text-sm">Healthy</p>
          <p className="text-m-green text-2xl font-bold">{totalCount - failedCount}</p>
        </div>
      </div>

      {jobs.length > 0 && (
        <details open={jobs.length <= 20}>
          <summary className="text-muted-foreground mb-2 cursor-pointer text-sm font-medium">
            Jobs ({jobs.length})
          </summary>
          <Card className="gap-0 overflow-hidden py-0 shadow-none">
            <CardContent className="p-0">
              <Table aria-label="Jobs">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Activity</TableHead>
                    <TableHead scope="col">Process</TableHead>
                    <TableHead scope="col">Retries</TableHead>
                    <TableHead scope="col">Error</TableHead>
                    <TableHead scope="col">Created</TableHead>
                    <TableHead scope="col" className="w-20">
                      <span className="sr-only">Actions</span>
                    </TableHead>
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
                            <div className="flex items-center gap-1">
                              <AskAiButton
                                variant="icon"
                                label="Explain this failure"
                                title="Explain this failure"
                                prompt={`Explain why job ${job.id} failed on engine "${engine}". It is on activity "${job.activityId}" of process "${job.processDefinitionKey}" (definition ${job.processDefinitionId}), instance ${job.processInstanceId}, retries=${job.retries}, created ${job.createTime}. Reported exception: "${job.exceptionMessage}". Steps: (1) read the full context with camunda7_get_process_instance({engine: "${engine}", id: "${job.processInstanceId}"}) and camunda7_get_process_instance_variables for the input that reached this activity; (2) find the matching incident with camunda7_list_incidents({engine: "${engine}", processInstanceId: "${job.processInstanceId}"}); (3) check camunda7_query_historic_activity_instances to see if activity "${job.activityId}" fails repeatedly. Then answer in plain language: what broke, whether it is transient (data/infra) or deterministic (code/config), and an explicit verdict — SAFE TO RETRY or WILL RE-FAIL — with one-line justification. Do not mutate anything.`}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={retryMutation.isPending}
                                onClick={() => handleRetry(job.id)}
                              >
                                Retry
                              </Button>
                            </div>
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

      <ConfirmDialog
        open={confirmBatch}
        onOpenChange={setConfirmBatch}
        title="Retry failed jobs?"
        description={`Creates a batch that sets one retry on ${failedJobs.length} failed ${
          failedJobs.length === 1 ? "job" : "jobs"
        }. They will re-execute; progress is tracked on the batch.`}
        confirmLabel={`Retry ${failedJobs.length}`}
        pending={batchMutation.isPending}
        onConfirm={handleBatchRetry}
      />
    </div>
  )
}
