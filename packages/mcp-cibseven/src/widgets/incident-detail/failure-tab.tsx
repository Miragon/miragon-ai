import { Alert, AlertDescription, Badge, Card, CardContent } from "@miragon/mcp-toolkit-ui"
import { AskAiButton, SectionHeading } from "@miragon-ai/widget-shell/widgets"

import type { IncidentDetailData } from "@miragon-ai/client-cibseven"

import { formatTimestamp } from "../../lib/format-time.js"

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
  const job = data.job
  const engineId = data.engineId ?? "default"
  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-0 py-0 shadow-none">
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
          <div>
            <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              Incident type
            </div>
            <div className="font-mono text-sm">{data.incidentType}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              Activity
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
              Occurred at
            </div>
            <div className="text-sm">{formatTimestamp(data.incidentTimestamp)}</div>
          </div>
          {job && (
            <div>
              <div className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                Job
              </div>
              <div className="flex items-center gap-2 text-sm">
                <code className="font-mono text-xs">{job.id}</code>
                <Badge variant={job.retries > 0 ? "secondary" : "destructive"}>
                  {job.retries} {job.retries === 1 ? "retry" : "retries"} left
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {resolved ? (
          <Badge variant="secondary">Incident resolved</Badge>
        ) : (
          <button
            type="button"
            onClick={onResolve}
            disabled={resolving}
            aria-label="Resolve incident"
            className="bg-critical-soft text-critical hover:bg-critical/10 focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 disabled:opacity-50"
          >
            <span aria-hidden="true">✓</span> Resolve incident
          </button>
        )}
        {job && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying || retried}
            aria-label={retried ? "Job retried" : "Retry job (set retries to 1)"}
            className="bg-m-blue-soft text-m-blue hover:bg-m-blue/10 focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 disabled:opacity-50"
          >
            <span aria-hidden="true">↻</span> {retried ? "Retried" : "Retry job (set retries to 1)"}
          </button>
        )}
        <AskAiButton
          variant="subtle"
          label="Draft GitHub issue"
          prompt={`Draft and file a GitHub issue for CIB Seven incident \`${data.incidentId}\` (${data.incidentType}) at ${data.activityName ?? data.activityId} (\`${data.activityId}\`) on instance ${data.processInstanceId} of ${data.processDefinitionName ?? data.processDefinitionKey} v${data.processDefinitionVersion}${data.businessKey ? `, business key ${data.businessKey}` : ""}, engine \`${engineId}\`. Build the payload with camunda7_format_incident_issue({ incidentId: '${data.incidentId}' }), include the error (${data.incidentMessage ?? job?.exceptionMessage ?? "(none reported)"}) and stacktrace, show me the title/body/labels for confirmation, then create it via the GitHub MCP server's create_issue.`}
        />
      </div>

      <div>
        <SectionHeading title="Error message" />
        <pre className="border-border bg-card text-foreground whitespace-pre-wrap break-words rounded-lg border p-3 font-mono text-xs">
          {data.incidentMessage ?? job?.exceptionMessage ?? "—"}
        </pre>
      </div>

      {job && (
        <div>
          <SectionHeading title="Stacktrace" hint={job.stacktrace ? undefined : "not available"} />
          {job.stacktrace ? (
            <pre className="border-border bg-card text-foreground max-h-[480px] overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed">
              {job.stacktrace}
            </pre>
          ) : (
            <Alert>
              <AlertDescription>
                No stacktrace returned by the engine. The job may not have an exception, or the
                stacktrace has been cleared.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  )
}
