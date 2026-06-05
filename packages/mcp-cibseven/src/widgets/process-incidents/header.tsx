import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import {
  AskAiButton,
  StatusBadge,
  WidgetShell,
  useHostActions,
  type HostActions,
} from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "@miragon-ai/client-cibseven"
import { formatTime } from "../../lib/format-time.js"
import { CAMUNDA7_PROCESS_INCIDENTS_DATA } from "../../tool-names.js"
import { useViewData } from "../use-view-data.js"

export function ProcessDetailHeader({
  data: initialData = null,
  processDefinitionKey,
  engine,
}: {
  data?: ProcessIncidentsData | null
  processDefinitionKey?: string
  engine?: string
}) {
  const host: HostActions = useHostActions()
  const { data, loading, error } = useViewData<ProcessIncidentsData>(
    initialData,
    ["camunda7:process-incidents", engine ?? null, processDefinitionKey ?? null],
    CAMUNDA7_PROCESS_INCIDENTS_DATA,
    { processDefinitionKey, engine },
    !!processDefinitionKey,
  )

  if (!data) {
    return (
      <WidgetShell>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : (
          <div className="text-muted-foreground p-2 text-sm">
            {loading ? "Loading…" : "No data available"}
          </div>
        )}
      </WidgetShell>
    )
  }

  const title = data.processDefinitionName ?? data.processDefinitionKey
  const cockpitUrl = data.cockpitUrl
  const remainingCount = data.incidentCount
  const engineId = engine ?? data.engineId
  const triagePrompt = `Root-cause triage for process \`${data.processDefinitionName ?? data.processDefinitionKey}\` (key \`${data.processDefinitionKey}\`, version v${data.version}) on engine \`${engineId}\`, which currently has ${data.incidentCount} open incident(s), +${data.last24hCount} in the last 24h, across ${data.activities.length} of ${data.totalActivityCount} activities. Use camunda7_list_incidents (processDefinitionKey \`${data.processDefinitionKey}\`, engine \`${engineId}\`) to pull the full incident set, then for the worst-affected activity use camunda7_get_activity_instance_tree and camunda7_get_process_instance_variables on a representative processInstanceId to inspect state. Cluster the incidents by failing activity and by error signature, tell me the single most likely root cause per cluster, whether the +${data.last24hCount} last-24h count looks like a new regression vs. steady background failures, and the safest next action (retry vs. modify vs. migrate). Do NOT change anything — analysis only.`

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
          <h1 className="text-foreground mb-1.5 text-2xl font-bold tracking-tight">
            {title}
            {data.version !== null && (
              <span className="border-border bg-muted text-muted-foreground ml-2 inline-block rounded border px-2 py-0.5 align-middle font-mono text-xs font-medium">
                v{data.version}
              </span>
            )}
          </h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs">{data.processDefinitionKey}</span>
            {data.runningInstances !== null && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>{data.runningInstances.toLocaleString()} running instances</span>
              </>
            )}
            {data.latestIncident && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>last event {formatTime(data.latestIncident)}</span>
              </>
            )}
            {cockpitUrl && (
              <>
                <span className="text-muted-foreground">·</span>
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
        <AskAiButton prompt={triagePrompt} variant="primary" />
      </header>
    </WidgetShell>
  )
}
