import { useState } from "react"
import { HostModelContext } from "@miragon/mcp-toolkit-ui/app"
import { Badge, Button, useToolMutation } from "@miragon/mcp-toolkit-ui"

import type { JobPanelData } from "../view-models.js"
import {
  AskAiButton,
  KpiGrid,
  ListTable,
  LogText,
  TableEmptyState,
  Td,
  ViewDataState,
  WidgetShell,
  formatTimestamp,
  usePagedViewData,
  useResetOnChange,
} from "@miragon-ai/widget-shell/widgets"
import { CAMUNDA7_JOBS_DATA } from "../tool-names.js"
import { CockpitListFooter } from "./list-footer.js"
import { refreshCockpitData } from "./refresh.js"
import { useCanRun } from "./widget-actions.js"
import { useHandOff, type HandOff, type ViewContext } from "./lib/hand-off.js"
import { useT } from "../messages/use-t.js"

export type { JobPanelData }

// Standalone renders hand in only `data`, so the show tool's scope comes
// from the payload's echo — loadMore must page the same engine and filter
// set as page 0 (incl. a processDefinitionKey filter the widget has no
// prop for).
function buildJobsFeed(initialData: JobPanelData | null, engine?: string, failedOnly?: boolean) {
  const echoed = initialData?.filters
  const feedEngine = engine ?? initialData?.engineId
  const effectiveFailedOnly = failedOnly ?? echoed?.failedOnly
  const args: Record<string, unknown> = {}
  if (feedEngine) args.engine = feedEngine
  if (effectiveFailedOnly !== undefined) args.failedOnly = effectiveFailedOnly
  if (echoed?.processDefinitionKey) args.processDefinitionKey = echoed.processDefinitionKey
  return { feedEngine, effectiveFailedOnly, args }
}

type Job = JobPanelData["jobs"][number]

/** What the operator sees in the job panel — the model's grounding for follow-ups. */
export function describeJobPanel(
  data: JobPanelData,
  engineId: string | undefined,
  loaded: number,
  failedOnly: boolean | undefined,
): ViewContext {
  return {
    summary: "The operator is viewing the job management panel.",
    ids: { engine: engineId },
    facts: {
      totalJobs: data.totalCount,
      failedJobs: data.failedCount,
      loaded,
      failedOnly: failedOnly === true ? true : undefined,
    },
    tools: [
      "camunda7_list_jobs",
      "camunda7_list_incidents",
      "camunda7_set_job_retries",
      "camunda7_set_job_retries_batch",
    ],
  }
}

/**
 * Triage of every failed job on the engine. The batch retry is one of the
 * tools only where the deployment registers it (admin) — elsewhere the
 * surface drops it and per-job retries (operations) or nothing (read-only)
 * remain for the recommendation.
 */
export function triageJobsHandOff(data: JobPanelData, engineId: string | undefined): HandOff {
  return {
    intent: "askAi.jobs.triage",
    ids: { engine: engineId, noRetriesLeft: true },
    facts: { totalJobs: data.totalCount, failedJobs: data.failedCount },
    tools: [
      "camunda7_list_jobs",
      "camunda7_get_job_stacktrace",
      "camunda7_list_incidents",
      "camunda7_query_historic_incidents",
      "camunda7_set_process_instance_variable",
      "camunda7_set_job_retries",
      "camunda7_set_job_retries_batch",
      "camunda7_format_incident_issue",
    ],
  }
}

/** Why ONE failed job failed — its exception text is engine data, quoted. */
export function explainJobHandOff(job: Job, engineId: string | undefined): HandOff {
  return {
    intent: "askAi.jobs.explainFailure",
    ids: {
      engine: engineId,
      jobId: job.id,
      processInstanceId: job.processInstanceId,
      processDefinitionKey: job.processDefinitionKey,
      activityId: job.activityId,
    },
    facts: { retries: job.retries },
    untrusted: [{ label: "exceptionMessage", text: job.exceptionMessage }],
    tools: [
      "camunda7_get_job_stacktrace",
      "camunda7_get_process_instance",
      "camunda7_get_process_instance_variables",
      "camunda7_list_incidents",
    ],
  }
}

/** A ticket draft for the incident behind ONE failed job (found by instance + activity). */
export function draftJobTicketHandOff(job: Job, engineId: string | undefined): HandOff {
  return {
    intent: "askAi.jobs.draftTicket",
    ids: {
      engine: engineId,
      processInstanceId: job.processInstanceId,
      activityId: job.activityId,
    },
    tools: ["camunda7_list_incidents", "camunda7_format_incident_issue"],
  }
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
  const [retryError, setRetryError] = useState<{ jobId: string; message: string } | null>(null)
  const retryMutation = useToolMutation("camunda7_set_job_retries")
  const canRun = useCanRun()
  const canRetry = canRun("camunda7_set_job_retries")
  const { ask, context } = useHandOff()
  const { feedEngine, effectiveFailedOnly, args } = buildJobsFeed(initialData, engine, failedOnly)
  const paged = usePagedViewData<JobPanelData["jobs"][number], JobPanelData>({
    initialData,
    key: ["camunda7:jobs", feedEngine ?? null, effectiveFailedOnly ?? null],
    tool: CAMUNDA7_JOBS_DATA,
    args,
    // Always ready: the feed's `engine` is optional — resolveEngine falls back
    // to the caller's saved default engine or the single configured engine (see the
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
  useResetOnChange(data, () => {
    setRetriedIds(new Set())
    setRetryError(null)
  })

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
      <HostModelContext
        content={context(describeJobPanel(data, engineId, jobs.length, failedOnly))}
      >
        {null}
      </HostModelContext>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{t("jobPanel.title")}</h2>
          <Badge variant="secondary">{t("jobPanel.badgeTotal", { count: totalCount })}</Badge>
          {failedCount > 0 && (
            <Badge variant="destructive">{t("jobPanel.badgeFailed", { count: failedCount })}</Badge>
          )}
        </div>
        {failedJobs.length > 0 && (
          <AskAiButton variant="primary" prompt={ask(triageJobsHandOff(data, engineId))} />
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

      {jobs.length === 0 ? (
        <TableEmptyState>{t("jobPanel.noJobs")}</TableEmptyState>
      ) : (
        <>
          <ListTable
            ariaLabel={t("jobPanel.tableLabel")}
            columns={[
              { label: t("jobPanel.colActivity") },
              { label: t("jobPanel.colProcess") },
              { label: t("jobPanel.colRetries"), align: "right" },
              { label: t("jobPanel.colError") },
              { label: t("jobPanel.colCreated"), align: "right" },
              { plain: true },
            ]}
          >
            {jobs.map((job) => {
              const retried = retriedIds.has(job.id)
              return (
                <tr
                  key={job.id}
                  className={retried ? "opacity-50" : "hover:bg-muted transition-colors"}
                >
                  <Td>
                    <span className="font-mono text-sm">{job.activityId ?? "\u2014"}</span>
                  </Td>
                  <Td>
                    <span className="font-mono text-sm">
                      {job.processDefinitionKey ?? "\u2014"}
                    </span>
                  </Td>
                  <Td align="right">
                    <Badge
                      variant={
                        retried ? "secondary" : job.retries === 0 ? "destructive" : "secondary"
                      }
                      className="tabular-nums"
                    >
                      {retried ? 1 : job.retries}
                    </Badge>
                  </Td>
                  <Td>
                    <LogText text={job.exceptionMessage} />
                  </Td>
                  <Td align="right" className="text-muted-foreground font-mono text-xs">
                    {formatTimestamp(job.createTime)}
                  </Td>
                  <Td align="right">
                    {job.retries === 0 && !retried && (
                      <div className="inline-flex items-center justify-end gap-1">
                        <AskAiButton
                          variant="icon"
                          label={t("jobPanel.explainFailure")}
                          title={t("jobPanel.explainFailure")}
                          prompt={ask(explainJobHandOff(job, engineId))}
                        />
                        <AskAiButton
                          variant="icon"
                          label={t("jobPanel.draftTicket")}
                          title={t("jobPanel.draftTicket")}
                          prompt={ask(draftJobTicketHandOff(job, engineId))}
                        />
                        {canRetry && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={retryMutation.isPending}
                            onClick={() => handleRetry(job.id)}
                          >
                            {t("jobPanel.retry")}
                          </Button>
                        )}
                      </div>
                    )}
                    {retried && <Badge variant="secondary">{t("jobPanel.retried")}</Badge>}
                    {retryError?.jobId === job.id && (
                      <p role="alert" className="text-critical mt-1 text-xs">
                        {t("jobPanel.retryError", { message: retryError.message })}
                      </p>
                    )}
                  </Td>
                </tr>
              )
            })}
          </ListTable>
          <CockpitListFooter paged={paged} noun={t("jobPanel.footerNoun")} />
        </>
      )}
    </WidgetShell>
  )
}
