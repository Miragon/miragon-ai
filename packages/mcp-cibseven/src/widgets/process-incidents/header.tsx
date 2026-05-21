import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import {
  StatusBadge,
  WidgetShell,
  useHostActions,
  type HostActions,
} from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "@miragon-ai/client-cibseven"
import { formatTime } from "../../lib/format-time.js"

export function ProcessDetailHeader({ data }: { data: ProcessIncidentsData | null }) {
  const host: HostActions = useHostActions()

  if (!data) {
    return (
      <WidgetShell>
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </WidgetShell>
    )
  }

  const title = data.processDefinitionName ?? data.processDefinitionKey
  const cockpitUrl = data.cockpitUrl
  const remainingCount = data.incidentCount

  return (
    <WidgetShell>
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <div className="bg-critical-soft text-critical grid size-11 place-items-center rounded-xl text-xl">
              ⚠
            </div>
            <StatusBadge tone="critical">
              {remainingCount} open {remainingCount === 1 ? "incident" : "incidents"}
            </StatusBadge>
          </div>
          <h1 className="text-ink mb-1.5 text-2xl font-bold tracking-tight">
            {title}
            {data.version !== null && (
              <span className="border-line bg-bg text-ink-muted ml-2 inline-block rounded border px-2 py-0.5 align-middle font-mono text-xs font-medium">
                v{data.version}
              </span>
            )}
          </h1>
          <div className="text-ink-muted flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs">{data.processDefinitionKey}</span>
            {data.runningInstances !== null && (
              <>
                <span className="text-ink-subtle">·</span>
                <span>{data.runningInstances.toLocaleString()} running instances</span>
              </>
            )}
            {data.latestIncident && (
              <>
                <span className="text-ink-subtle">·</span>
                <span>last event {formatTime(data.latestIncident)}</span>
              </>
            )}
            {cockpitUrl && (
              <>
                <span className="text-ink-subtle">·</span>
                <a
                  href={cockpitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault()
                    host.openLink(cockpitUrl)
                  }}
                  className="text-m-blue hover:underline"
                >
                  <span aria-hidden="true">▦</span> Open in Cockpit{" "}
                  <span aria-hidden="true">→</span>
                </a>
              </>
            )}
          </div>
        </div>
      </header>
    </WidgetShell>
  )
}
