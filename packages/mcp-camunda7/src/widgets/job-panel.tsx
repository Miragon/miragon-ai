import { useEffect, useState } from "react"
import { ModelContext } from "mcp-use/react"
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
  Button,
  useToolMutation,
} from "@miragon/mcp-toolkit-ui"

import type { JobPanelData } from "../view-models.js"
import {
  AskAiButton,
  KpiGrid,
  ListFooter,
  LogText,
  ViewDataState,
  WidgetShell,
  formatTimestamp,
  usePagedViewData,
} from "@miragon-ai/widget-shell/widgets"
import { CAMUNDA7_JOBS_DATA } from "../tool-names.js"
import { refreshCockpitData } from "./refresh.js"
import { useT } from "../messages/use-t.js"

export type { JobPanelData }

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
  const [retryError, setRetryError] = useState<{ jobId: string; message: string } | null>(null)
  // null = derive from the first page size; a boolean pins the user's choice so
  // loadMore crossing the threshold can't collapse the list under them.
  const [jobsOpen, setJobsOpen] = useState<boolean | null>(null)
  const retryMutation = useToolMutation("camunda7_set_job_retries")
  const paged = usePagedViewData<JobPanelData["jobs"][number], JobPanelData>({
    initialData,
    key: ["camunda7:jobs", engine ?? null, failedOnly ?? null],
    tool: CAMUNDA7_JOBS_DATA,
    args: { engine, failedOnly },
    // Always ready: the feed's `engine` is optional — resolveEngine falls back
    // to the sticky session selection or the single configured engine (see the
    // engine-health view for the same rule). Gating on `!!engine` would leave
    // a composed render without props stuck on "No data available" forever.
    ready: true,
    selectItems: (d) => d.jobs,
    selectTotal: (d) => d.totalCount,
    pageSize: 50,
  })
  const t = useT()
  const data = paged.firstPage
  // The optimistic retried-shadows only bridge the gap until the feed
  // refetches — fresh server data (new page-0 identity) must win again.
  useEffect(() => {
    setRetriedIds(new Set())
    setRetryError(null)
  }, [data])
  // Pin the disclosure to the FIRST page's size before any loadMore can grow
  // `jobs.length` past the threshold (user toggles win from then on).
  useEffect(() => {
    if (data) setJobsOpen((prev) => prev ?? data.jobs.length <= 20)
  }, [data])

  if (!data) {
    return (
      <WidgetShell>
        <ViewDataState
          loading={paged.loading}
          error={paged.error}
          loadingText={t("jobPanel.loading")}
          emptyText={t("jobPanel.noData")}
        />
      </WidgetShell>
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
    setRetryError(null)
    retryMutation.mutate(
      { jobId, retries: 1, engine: engineId },
      {
        onSuccess: () => {
          setRetriedIds((prev) => new Set(prev).add(jobId))
          refreshCockpitData()
        },
        onError: (error) =>
          setRetryError({
            jobId,
            message: error instanceof Error ? error.message : String(error),
          }),
      },
    )
  }

  return (
    <WidgetShell>
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
          <h2 className="text-xl font-semibold">{t("jobPanel.title")}</h2>
          <Badge variant="secondary">{t("jobPanel.badgeTotal", { count: totalCount })}</Badge>
          {failedCount > 0 && (
            <Badge variant="destructive">{t("jobPanel.badgeFailed", { count: failedCount })}</Badge>
          )}
        </div>
        {failedJobs.length > 0 && (
          <AskAiButton
            variant="primary"
            prompt={`Triage the failed jobs (retries == 0) on engine "${engineId}" surfaced in the Job Management panel. The engine reports ${totalCount} total jobs and ${failedCount} failed. Use camunda7_list_jobs({engine: "${engineId}", noRetriesLeft: true}) to load the exact failed set, then: (1) cluster the jobs by normalized exceptionMessage and by activityId/processDefinitionKey; (2) for each cluster name the most likely root cause, cross-checking with camunda7_list_incidents({engine: "${engineId}"}) and camunda7_query_historic_activity_instances to see whether the same activity is failing across many instances (systemic) or one-off; (3) recommend a concrete action per cluster — transient/infra errors -> batch retry via camunda7_set_job_retries_batch, bad input data -> camunda7_set_process_instance_variable then retry, code/deployment defect -> escalate and draft a ticket. Return a short ranked table: cluster | likely cause | affected count | recommended action. Do not execute any retry or mutation; recommend only.`}
          />
        )}
      </div>
      <KpiGrid
        variant="soft"
        className="grid-cols-2 gap-3 sm:grid-cols-3"
        ariaLabel={t("jobPanel.summaryLabel")}
        cells={[
          { label: t("jobPanel.totalJobs"), value: totalCount },
          { label: t("jobPanel.stuck"), value: failedCount, tone: "critical" },
          { label: t("jobPanel.healthy"), value: totalCount - failedCount, tone: "success" },
        ]}
      />

      {jobs.length > 0 && (
        <details
          open={jobsOpen ?? jobs.length <= 20}
          onToggle={(e) => setJobsOpen(e.currentTarget.open)}
        >
          <summary className="text-muted-foreground mb-2 cursor-pointer text-sm font-medium">
            {t("jobPanel.jobsSummary", { count: jobs.length })}
          </summary>
          <Card className="gap-0 overflow-hidden py-0 shadow-none">
            <CardContent className="p-0">
              <Table aria-label={t("jobPanel.tableLabel")}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{t("jobPanel.colActivity")}</TableHead>
                    <TableHead scope="col">{t("jobPanel.colProcess")}</TableHead>
                    <TableHead scope="col">{t("jobPanel.colRetries")}</TableHead>
                    <TableHead scope="col">{t("jobPanel.colError")}</TableHead>
                    <TableHead scope="col">{t("jobPanel.colCreated")}</TableHead>
                    <TableHead scope="col" className="w-20">
                      <span className="sr-only">{t("jobPanel.colActions")}</span>
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
                          <LogText text={job.exceptionMessage} />
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {formatTimestamp(job.createTime)}
                        </TableCell>
                        <TableCell>
                          {job.retries === 0 && !retried && (
                            <div className="flex items-center gap-1">
                              <AskAiButton
                                variant="icon"
                                label={t("jobPanel.explainFailure")}
                                title={t("jobPanel.explainFailure")}
                                prompt={`Explain why job ${job.id} failed on engine "${engineId}". It is on activity "${job.activityId}" of process "${job.processDefinitionKey}" (definition ${job.processDefinitionId}), instance ${job.processInstanceId}, retries=${job.retries}, created ${job.createTime}. Reported exception: "${job.exceptionMessage}". Steps: (1) read the full context with camunda7_get_process_instance({engine: "${engineId}", id: "${job.processInstanceId}"}) and camunda7_get_process_instance_variables for the input that reached this activity; (2) find the matching incident with camunda7_list_incidents({engine: "${engineId}", processInstanceId: "${job.processInstanceId}"}); (3) check camunda7_query_historic_activity_instances to see if activity "${job.activityId}" fails repeatedly. Then answer in plain language: what broke, whether it is transient (data/infra) or deterministic (code/config), and an explicit verdict — SAFE TO RETRY or WILL RE-FAIL — with one-line justification. Do not mutate anything.`}
                              />
                              <AskAiButton
                                variant="icon"
                                label={t("jobPanel.draftTicket")}
                                title={t("jobPanel.draftTicket")}
                                prompt={`Draft an incident ticket for the incident behind failed job ${job.id} on engine "${engineId}". This job has no incidentId directly, so first FIND the incident: call camunda7_list_incidents({ engine: "${engineId}", processInstanceId: "${job.processInstanceId}" }) and pick the incident for this job (activity "${job.activityId}" of process "${job.processDefinitionKey}", instance ${job.processInstanceId}; reported exception: "${job.exceptionMessage}"). Then build the draft with camunda7_format_incident_issue({ incidentId: "<found incident id>" }) and present the full draft (title, body, labels) to me in the chat for review and reuse. Do NOT file it anywhere yourself — I decide where it goes; only file it if I explicitly ask, via whatever issue-tracker integration is available.`}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={retryMutation.isPending}
                                onClick={() => handleRetry(job.id)}
                              >
                                {t("jobPanel.retry")}
                              </Button>
                            </div>
                          )}
                          {retried && <Badge variant="secondary">{t("jobPanel.retried")}</Badge>}
                          {retryError?.jobId === job.id && (
                            <p role="alert" className="text-critical mt-1 text-xs">
                              {t("jobPanel.retryError", { message: retryError.message })}
                            </p>
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
        noun={t("jobPanel.footerNoun")}
      />

      {jobs.length === 0 && (
        <p className="text-muted-foreground py-4 text-center text-sm">{t("jobPanel.noJobs")}</p>
      )}
    </WidgetShell>
  )
}
