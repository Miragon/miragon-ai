import { Alert, AlertDescription, Badge, Card, CardContent } from "@miragon/mcp-toolkit-ui"
import { AskAiButton, SectionHeading } from "@miragon-ai/widget-shell/widgets"

import type { IncidentDetailData } from "../../view-models.js"

import { formatTimestamp } from "../../lib/format-time.js"
import { useT } from "../../messages/use-t.js"

export function FailureTab({
  data,
  resolved,
  onResolve,
  resolving,
  onRetry,
  retrying,
  retried,
}: {
  data: IncidentDetailData
  resolved: boolean
  onResolve: () => void
  resolving: boolean
  onRetry: () => void
  retrying: boolean
  retried: boolean
}) {
  const t = useT()
  const job = data.job
  const engineId = data.engineId ?? "default"
  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-0 py-0 shadow-none">
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
          <div>
            <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              {t("incidentFailure.incidentType")}
            </div>
            <div className="font-mono text-sm">{data.incidentType}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
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
            <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              {t("incidentFailure.occurredAt")}
            </div>
            <div className="text-sm">{formatTimestamp(data.incidentTimestamp)}</div>
          </div>
          {job && (
            <div>
              <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
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

      <div className="flex flex-wrap items-center gap-2">
        {resolved ? (
          <Badge variant="secondary">{t("incidentFailure.resolvedBadge")}</Badge>
        ) : (
          <button
            type="button"
            onClick={onResolve}
            disabled={resolving}
            aria-label={t("incidentFailure.resolveAria")}
            className="bg-critical-soft text-critical hover:bg-critical/10 focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 disabled:opacity-50"
          >
            <span aria-hidden="true">✓</span> {t("incidentFailure.resolveButton")}
          </button>
        )}
        {job && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying || retried}
            aria-label={retried ? t("incidentFailure.retriedAria") : t("incidentFailure.retryAria")}
            className="bg-m-blue-soft text-m-blue hover:bg-m-blue/10 focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 disabled:opacity-50"
          >
            <span aria-hidden="true">↻</span>{" "}
            {retried ? t("incidentFailure.retriedButton") : t("incidentFailure.retryButton")}
          </button>
        )}
        <AskAiButton
          variant="subtle"
          label={t("incidentFailure.draftTicketLabel")}
          prompt={`Draft an incident ticket for CIB Seven incident \`${data.incidentId}\` (${data.incidentType}) at ${data.activityName ?? data.activityId} (\`${data.activityId}\`) on instance ${data.processInstanceId} of ${data.processDefinitionName ?? data.processDefinitionKey} v${data.processDefinitionVersion}${data.businessKey ? `, business key ${data.businessKey}` : ""}, engine \`${engineId}\`. Build the draft with camunda7_format_incident_issue({ incidentId: '${data.incidentId}' }), include the error (${data.incidentMessage ?? job?.exceptionMessage ?? "(none reported)"}) and stacktrace, and present the full draft (title, body, labels) to me in the chat for review and reuse. Do NOT file it anywhere yourself — I decide where it goes; only file it if I explicitly ask, via whatever issue-tracker integration is available.`}
        />
      </div>

      <div>
        <SectionHeading
          title={t("incidentFailure.errorMessageTitle")}
          trailing={
            <AskAiButton
              variant="subtle"
              label={t("incidentFailure.explainErrorLabel")}
              prompt={`Explain the failure on CIB Seven incident \`${data.incidentId}\` at ${data.activityName ?? data.activityId} (\`${data.activityId}\`) on instance ${data.processInstanceId} of ${data.processDefinitionName ?? data.processDefinitionKey}, engine \`${engineId}\`. The reported error is: "${data.incidentMessage ?? job?.exceptionMessage ?? "(none reported)"}"${job?.stacktrace ? `, with a Java stacktrace on job ${job.id}` : ""}. In plain language: what does this exception mean, what most likely caused it here, and is it transient (safe to retry) or deterministic (will re-fail)? Read the full trace with camunda7_incident_detail_data({ incidentId: "${data.incidentId}" }) if needed. Explanation only — do not change anything.`}
            />
          }
        />
        <pre className="border-border bg-card text-foreground whitespace-pre-wrap break-words rounded-lg border p-3 font-mono text-xs">
          {data.incidentMessage ?? job?.exceptionMessage ?? "—"}
        </pre>
      </div>

      {job && (
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
      )}
    </div>
  )
}
