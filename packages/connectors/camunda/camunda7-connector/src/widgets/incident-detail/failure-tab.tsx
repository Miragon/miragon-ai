import { Alert, AlertDescription, Badge, Button, Card, CardContent } from "@miragon/mcp-toolkit-ui"
import {
  LogText,
  SectionHeading,
  formatNumber,
  formatTimestamp,
} from "@miragon-ai/widget-shell/widgets"

import type { IncidentDetailData, IncidentDetailJob } from "../../view-models.js"

import { recoveryOf } from "../lib/incident-recovery.js"
import { useHandOff, type HandOff } from "../lib/hand-off.js"
import { HandOffButton } from "../lib/hand-off-button.js"
import { useT } from "../../messages/use-t.js"

/** The engine's error text for the incident — the incident message, else the job's exception. */
function errorText(data: IncidentDetailData): string | null | undefined {
  return data.incidentMessage ?? data.job?.exceptionMessage
}

/** A ticket draft for THIS incident — built by the format tool, never filed. */
export function draftTicketHandOff(data: IncidentDetailData): HandOff {
  return {
    intent: "askAi.incident.draftTicket",
    ids: { engine: data.engineId, incidentId: data.incidentId },
    facts: { incidentType: data.incidentType },
    untrusted: [{ label: "incidentMessage", text: errorText(data) }],
    tools: ["camunda7_format_incident_issue"],
  }
}

/**
 * What this incident's error means. The full failure text is read through a
 * model-visible tool — the job's stacktrace, a worker's error details via the
 * external-task list, or both condensed in the ticket draft — never through
 * the app-only incident feed the host hides from the model.
 */
export function explainErrorHandOff(data: IncidentDetailData): HandOff {
  return {
    intent: "askAi.incident.explainError",
    ids: {
      engine: data.engineId,
      incidentId: data.incidentId,
      jobId: data.job?.id,
      processInstanceId: data.processInstanceId,
      activityId: data.activityId,
    },
    facts: { incidentType: data.incidentType },
    untrusted: [{ label: "incidentMessage", text: errorText(data) }],
    tools: [
      "camunda7_get_job_stacktrace",
      "camunda7_list_external_tasks",
      "camunda7_format_incident_issue",
    ],
  }
}

export function FailureTab({
  data,
  resolved,
  onResolve,
  resolving,
  onRetry,
  retrying,
  retried,
  retryError,
}: {
  data: IncidentDetailData
  resolved: boolean
  /** Omitted when the deployment's toolset has no resolve tool — no button. */
  onResolve?: () => void
  resolving: boolean
  /** Omitted when the deployment's toolset has no retry tool — no button. */
  onRetry?: () => void
  retrying: boolean
  retried: boolean
  retryError?: string | null
}) {
  return (
    <div className="flex flex-col gap-4">
      <FactsCard data={data} />
      <ActionsRow
        data={data}
        resolved={resolved}
        onResolve={onResolve}
        resolving={resolving}
        onRetry={onRetry}
        retrying={retrying}
        retried={retried}
        retryError={retryError}
      />
      <ErrorMessageSection data={data} />
      {data.job && <StacktraceSection job={data.job} />}
    </div>
  )
}

function FactsCard({ data }: { data: IncidentDetailData }) {
  const t = useT()
  const job = data.job
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
        <div>
          <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {t("incidentFailure.incidentType")}
          </div>
          <div className="font-mono text-sm">{data.incidentType}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {t("incidentFailure.activity")}
          </div>
          <div className="text-sm">
            {data.activityName ?? data.activityId}
            {data.activityName && (
              <span className="text-muted-foreground ml-2 font-mono text-xs">
                ({data.activityId})
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {t("incidentFailure.occurredAt")}
          </div>
          <div className="text-muted-foreground font-mono text-xs">
            {formatTimestamp(data.incidentTimestamp)}
          </div>
        </div>
        {job && (
          <div>
            <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {t("incidentFailure.job")}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <code className="font-mono text-xs">{job.id}</code>
              <Badge variant={job.retries > 0 ? "secondary" : "destructive"}>
                {t("incidentFailure.retriesLeft", { count: formatNumber(job.retries) })}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ActionsRow({
  data,
  resolved,
  onResolve,
  resolving,
  onRetry,
  retrying,
  retried,
  retryError,
}: {
  data: IncidentDetailData
  resolved: boolean
  /** Omitted when the deployment's toolset has no resolve tool — no button. */
  onResolve?: () => void
  resolving: boolean
  /** Omitted when the deployment's toolset has no retry tool — no button. */
  onRetry?: () => void
  retrying: boolean
  retried: boolean
  retryError?: string | null
}) {
  const t = useT()
  const { ask } = useHandOff()
  return (
    <div className="flex flex-col gap-1.5">
      {/* The deterministic recovery first; the chat hand-off follows it. */}
      <div className="flex flex-wrap items-center gap-2">
        {onRetry && (
          <RetryButton data={data} onRetry={onRetry} retrying={retrying} retried={retried} />
        )}
        {resolved ? (
          <Badge variant="secondary">{t("incidentDetail.resolved")}</Badge>
        ) : (
          onResolve && (
            <Button
              variant="outline"
              size="sm"
              onClick={onResolve}
              disabled={resolving}
              aria-label={t("incidentFailure.resolveAria")}
            >
              {t("incidentFailure.resolveButton")}
            </Button>
          )
        )}
        <HandOffButton action="draftTicket" prompt={ask(draftTicketHandOff(data))} />
      </div>
      {retryError && (
        <p role="alert" className="text-danger-ink text-xs">
          {t("incidentFailure.retryError", { message: retryError })}
        </p>
      )}
    </div>
  )
}

/** Retry — the only remedy for a failedJob / failedExternalTask incident. */
function RetryButton({
  data,
  onRetry,
  retrying,
  retried,
}: {
  data: IncidentDetailData
  onRetry: () => void
  retrying: boolean
  retried: boolean
}) {
  const t = useT()
  const task = recoveryOf(data).action === "retry-external-task"
  const aria = task ? t("incidentFailure.retryTaskAria") : t("incidentFailure.retryAria")
  const retriedAria = task ? t("incidentFailure.retriedTaskAria") : t("incidentFailure.retriedAria")
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onRetry}
      disabled={retrying || retried}
      title={aria}
      aria-label={retried ? retriedAria : aria}
    >
      {retried
        ? t("incidentFailure.retriedButton")
        : task
          ? t("incidentFailure.retryTaskButton")
          : t("incidentFailure.retryButton")}
    </Button>
  )
}

function ErrorMessageSection({ data }: { data: IncidentDetailData }) {
  const t = useT()
  const { ask } = useHandOff()
  return (
    <div>
      <SectionHeading
        title={t("incidentFailure.errorMessageTitle")}
        trailing={<HandOffButton action="explainError" prompt={ask(explainErrorHandOff(data))} />}
      />
      <LogText text={data.incidentMessage ?? data.job?.exceptionMessage} />
    </div>
  )
}

function StacktraceSection({ job }: { job: IncidentDetailJob }) {
  const t = useT()
  return (
    <div>
      <SectionHeading
        title={t("incidentFailure.stacktraceTitle")}
        hint={job.stacktrace ? undefined : t("incidentFailure.stacktraceUnavailableHint")}
      />
      {job.stacktrace ? (
        <pre className="border-border bg-card text-foreground max-h-[480px] overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed">
          {job.stacktrace}
        </pre>
      ) : (
        <Alert>
          <AlertDescription>{t("incidentFailure.noStacktrace")}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
