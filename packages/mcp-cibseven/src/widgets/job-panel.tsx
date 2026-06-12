import { useState } from "react"
import { ModelContext } from "mcp-use/react"
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

import type { JobPanelData } from "../view-models.js"
import { AskAiButton, ListFooter, usePagedViewData } from "@miragon-ai/widget-shell/widgets"
import { CAMUNDA7_JOBS_DATA } from "../tool-names.js"
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
  failedOnly,
}: {
  data?: JobPanelData | null
  engine?: string
  /** Restrict the self-fetched job set to failed jobs (no retries left). */
  failedOnly?: boolean
}) {
  const [retriedIds, setRetriedIds] = useState<Set<string>>(new Set())
  const retryMutation = useToolMutation("camunda7_set_job_retries")
  const paged = usePagedViewData<JobPanelData["jobs"][number], JobPanelData>({
    initialData,
    key: ["camunda7:jobs", engine ?? null, failedOnly ?? null],
    tool: CAMUNDA7_JOBS_DATA,
    args: { engine, failedOnly },
    pageSize: 50,
    ready: !!engine,
    selectItems: (d) => d.jobs,
    selectTotal: (d) => d.totalCount,
  })
  const data = paged.firstPage

  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        {paged.error ? (
          <Alert variant="destructive">
            <AlertDescription>{paged.error.message}</AlertDescription>
          </Alert>
        ) : (
          <div className="text-muted-foreground text-sm">
            {paged.loading ? "Loading…" : "No data available"}
          </div>
        )}
      </div>
    )
  }

  const { totalCount, failedCount } = data
  const jobs = paged.items
  const failedJobs = jobs.filter((j) => j.retries === 0 && !retriedIds.has(j.id))
  // Standalone (camunda7_show_job_panel) the `engine` prop is undefined; fall back
  // to the engine the data was fetched against (the builder always sets it) so the
  // AI prompts never inline "undefined" into their tool-call arguments.
  const engineId = engine ?? data.engineId

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

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-4 p-6">
      {/* Rendered in-component (not via the adapter's describeForModel) because
          this widget self-fetches in the cockpit, where the adapter has no data. */}
      <ModelContext
        content={[
          `Viewing the Job Management panel on engine "${engineId}"` +
            `${failedOnly ? " filtered to failed jobs only" : ""}: ` +
            `${totalCount} job(s) total, ${failedCount} failed (no retries left), ` +
            `${jobs.length} loaded.`,
          `Retry one with camunda7_set_job_retries, all failed ones via ` +
            `camunda7_set_job_retries_batch; matching incidents via camunda7_list_incidents.`,
        ].join(" ")}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">Job Management</h2>
          <Badge variant="secondary">{totalCount} total</Badge>
          {failedCount > 0 && <Badge variant="destructive">{failedCount} failed</Badge>}
        </div>
        {failedJobs.length > 0 && (
          <AskAiButton
            variant="primary"
            prompt={`Triage the failed jobs (retries == 0) on engine "${engineId}" surfaced in the Job Management panel. The engine reports ${totalCount} total jobs and ${failedCount} failed. Use camunda7_list_jobs({engine: "${engineId}", noRetriesLeft: true}) to load the exact failed set, then: (1) cluster the jobs by normalized exceptionMessage and by activityId/processDefinitionKey; (2) for each cluster name the most likely root cause, cross-checking with camunda7_list_incidents({engine: "${engineId}"}) and camunda7_query_historic_activity_instances to see whether the same activity is failing across many instances (systemic) or one-off; (3) recommend a concrete action per cluster — transient/infra errors -> batch retry via camunda7_set_job_retries_batch, bad input data -> camunda7_set_process_instance_variable then retry, code/deployment defect -> escalate and draft a ticket. Return a short ranked table: cluster | likely cause | affected count | recommended action. Do not execute any retry or mutation; recommend only.`}
          />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Job summary">
        <div className="bg-muted rounded-lg p-4">
          <p className="text-muted-foreground text-sm">Total Jobs</p>
          <p className="text-2xl font-bold">{totalCount}</p>
        </div>
        <div className="bg-critical-soft rounded-lg p-4">
          <p className="text-muted-foreground text-sm">Stuck (no retries left)</p>
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
                                prompt={`Explain why job ${job.id} failed on engine "${engineId}". It is on activity "${job.activityId}" of process "${job.processDefinitionKey}" (definition ${job.processDefinitionId}), instance ${job.processInstanceId}, retries=${job.retries}, created ${job.createTime}. Reported exception: "${job.exceptionMessage}". Steps: (1) read the full context with camunda7_get_process_instance({engine: "${engineId}", id: "${job.processInstanceId}"}) and camunda7_get_process_instance_variables for the input that reached this activity; (2) find the matching incident with camunda7_list_incidents({engine: "${engineId}", processInstanceId: "${job.processInstanceId}"}); (3) check camunda7_query_historic_activity_instances to see if activity "${job.activityId}" fails repeatedly. Then answer in plain language: what broke, whether it is transient (data/infra) or deterministic (code/config), and an explicit verdict — SAFE TO RETRY or WILL RE-FAIL — with one-line justification. Do not mutate anything.`}
                              />
                              <AskAiButton
                                variant="icon"
                                label="Draft ticket"
                                title="Draft ticket"
                                prompt={`Draft and file a GitHub issue for the incident behind failed job ${job.id} on engine "${engineId}". This job has no incidentId directly, so first FIND the incident: call camunda7_list_incidents({ engine: "${engineId}", processInstanceId: "${job.processInstanceId}" }) and pick the incident for this job (activity "${job.activityId}" of process "${job.processDefinitionKey}", instance ${job.processInstanceId}; reported exception: "${job.exceptionMessage}"). Then build the GitHub issue payload with camunda7_format_incident_issue({ incidentId: "<found incident id>" }), show me the title/body/labels for confirmation, then create it via the GitHub MCP server's create_issue. Do not create it without my confirmation.`}
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

      <ListFooter
        shown={jobs.length}
        total={paged.total}
        hasMore={paged.hasMore}
        loadingMore={paged.loadingMore}
        onLoadMore={paged.loadMore}
        noun="jobs"
      />

      {jobs.length === 0 && (
        <p className="text-muted-foreground py-4 text-center text-sm">No jobs found</p>
      )}
    </div>
  )
}
