import { Alert, AlertDescription, Badge, Card, CardContent } from "@miragon/mcp-toolkit-ui"
import { SectionHeading, useHostActions } from "@miragon-ai/widget-shell/widgets"

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
  const host = useHostActions()
  const job = data.job

  function reportToGitHub() {
    // Hands a structured natural-language prompt back to the host agent, which
    // chains the registered `report_incident_to_github` prompt → format tool →
    // GitHub MCP server's `create_issue`. See packages/mcp-cibseven/src/tools/incident-issue.ts.
    host.showWidget(
      `File a GitHub issue for incident \`${data.incidentId}\` (use the report_incident_to_github prompt).`,
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-0 py-0 shadow-none">
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
          <div>
            <div className="text-ink-subtle text-xs font-semibold uppercase tracking-wide">
              Incident type
            </div>
            <div className="font-mono text-sm">{data.incidentType}</div>
          </div>
          <div>
            <div className="text-ink-subtle text-xs font-semibold uppercase tracking-wide">
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
            <div className="text-ink-subtle text-xs font-semibold uppercase tracking-wide">
              Occurred at
            </div>
            <div className="text-sm">{formatTimestamp(data.incidentTimestamp)}</div>
          </div>
          {job && (
            <div>
              <div className="text-ink-subtle text-xs font-semibold uppercase tracking-wide">
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
            className="bg-critical-soft text-critical hover:bg-critical/10 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            ✓ Resolve incident
          </button>
        )}
        {job && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying || retried}
            className="bg-m-blue-soft text-m-blue hover:bg-m-blue/10 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            ↻ {retried ? "Retried" : "Retry job (set retries to 1)"}
          </button>
        )}
        <button
          type="button"
          onClick={reportToGitHub}
          className="border-line text-ink-muted hover:bg-bg-subtle inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium"
          title="Hand off to the agent to file a GitHub issue via the configured GitHub MCP server"
        >
          ⚑ File GitHub issue
        </button>
      </div>

      <div>
        <SectionHeading title="Error message" />
        <pre className="border-line bg-card text-ink whitespace-pre-wrap break-words rounded-lg border p-3 font-mono text-xs">
          {data.incidentMessage ?? job?.exceptionMessage ?? "—"}
        </pre>
      </div>

      {job && (
        <div>
          <SectionHeading title="Stacktrace" hint={job.stacktrace ? undefined : "not available"} />
          {job.stacktrace ? (
            <pre className="border-line bg-card text-ink max-h-[480px] overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed">
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
