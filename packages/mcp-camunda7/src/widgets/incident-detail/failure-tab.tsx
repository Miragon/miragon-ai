import { Alert, AlertDescription, Badge, Button, Card, CardContent } from "@miragon/mcp-toolkit-ui"
import {
  AskAiButton,
  LogText,
  SectionHeading,
  formatTimestamp,
} from "@miragon-ai/widget-shell/widgets"

import type { IncidentDetailData, IncidentDetailJob } from "../../view-models.js"

import { fenceUntrusted } from "../lib/untrusted.js"
import { useT } from "../../messages/use-t.js"

function draftTicketPrompt(data: IncidentDetailData): string {
  const engineId = data.engineId ?? "default"
  return `Draft an incident ticket for CIB Seven incident \`${data.incidentId}\` (${data.incidentType}) at ${data.activityName ?? data.activityId} (\`${data.activityId}\`) on instance ${data.processInstanceId} of ${data.processDefinitionName ?? data.processDefinitionKey}${data.processDefinitionVersion !== null ? ` v${data.processDefinitionVersion}` : ""}${data.businessKey ? `, business key ${data.businessKey}` : ""}, engine \`${engineId}\`. Build the draft with camunda7_format_incident_issue({ incidentId: '${data.incidentId}' }), include the error (${fenceUntrusted(data.incidentMessage ?? data.job?.exceptionMessage)}) and stacktrace, and present the full draft (title, body, labels) to me in the chat for review and reuse. Do NOT file it anywhere yourself — I decide where it goes; only file it if I explicitly ask, via whatever issue-tracker integration is available.`
}

function explainErrorPrompt(data: IncidentDetailData): string {
  const engineId = data.engineId ?? "default"
  return `Explain the failure on CIB Seven incident \`${data.incidentId}\` at ${data.activityName ?? data.activityId} (\`${data.activityId}\`) on instance ${data.processInstanceId} of ${data.processDefinitionName ?? data.processDefinitionKey}, engine \`${engineId}\`. The reported error is ${fenceUntrusted(data.incidentMessage ?? data.job?.exceptionMessage)}${data.job?.stacktrace ? `, with a Java stacktrace on job ${data.job.id}` : ""}. In plain language: what does this exception mean, what most likely caused it here, and is it transient (safe to retry) or deterministic (will re-fail)? Read the full trace with camunda7_incident_detail_data({ incidentId: "${data.incidentId}" }) if needed. Explanation only — do not change anything.`
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
  onResolve: () => void
  resolving: boolean
  onRetry: () => void
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
                {job.retries === 1
                  ? t("incidentFailure.retriesLeftOne", { count: job.retries })
                  : t("incidentFailure.retriesLeftOther", { count: job.retries })}
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
  onResolve: () => void
  resolving: boolean
  onRetry: () => void
  retrying: boolean
  retried: boolean
  retryError?: string | null
}) {
  const t = useT()
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <AskAiButton
          variant="subtle"
          label={t("incidentFailure.draftTicketLabel")}
          prompt={draftTicketPrompt(data)}
        />
        {data.job && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={retrying || retried}
            title={t("incidentFailure.retryAria")}
            aria-label={retried ? t("incidentFailure.retriedAria") : t("incidentFailure.retryAria")}
          >
            {retried ? t("incidentFailure.retriedButton") : t("incidentFailure.retryButton")}
          </Button>
        )}
        {resolved ? (
          <Badge variant="secondary">{t("incidentDetail.resolved")}</Badge>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onResolve}
            disabled={resolving}
            aria-label={t("incidentFailure.resolveAria")}
          >
            {t("incidentFailure.resolveButton")}
          </Button>
        )}
      </div>
      {retryError && (
        <p role="alert" className="text-critical text-xs">
          {t("incidentFailure.retryError", { message: retryError })}
        </p>
      )}
    </div>
  )
}

function ErrorMessageSection({ data }: { data: IncidentDetailData }) {
  const t = useT()
  return (
    <div>
      <SectionHeading
        title={t("incidentFailure.errorMessageTitle")}
        trailing={
          <AskAiButton
            variant="subtle"
            label={t("incidentFailure.explainErrorLabel")}
            prompt={explainErrorPrompt(data)}
          />
        }
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
