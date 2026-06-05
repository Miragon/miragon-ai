import {
  Card,
  CardContent,
  Badge,
  Alert,
  AlertDescription,
  useToolQuery,
} from "@miragon/mcp-toolkit-ui"
import { AskAiButton } from "@miragon-ai/widget-shell/widgets"
import type { ProcessListData } from "@miragon-ai/client-cibseven"

export type { ProcessListData }

export function ProcessListWidget({
  data: initialData,
  processDefinitionKey,
  nameLike,
  latestVersion,
}: {
  data: ProcessListData | null
  /** Filter by exact process definition key. */
  processDefinitionKey?: string
  /** Filter by partial process definition name. */
  nameLike?: string
  /** Restrict to the latest version of each definition (default `true`). */
  latestVersion?: boolean
}) {
  const queryArgs: { key?: string; nameLike?: string; latestVersion?: boolean } = {}
  if (processDefinitionKey) queryArgs.key = processDefinitionKey
  if (nameLike) queryArgs.nameLike = nameLike
  if (latestVersion !== undefined) queryArgs.latestVersion = latestVersion
  const fallbackQuery = useToolQuery<ProcessListData>(
    ["camunda7:process-list"],
    "camunda7_show_process_list",
    queryArgs,
    { enabled: !initialData },
  )
  const data = initialData ?? fallbackQuery.data ?? null

  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        {fallbackQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{fallbackQuery.error.message}</AlertDescription>
          </Alert>
        ) : (
          <p className="text-muted-foreground text-sm">Loading process definitions…</p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Process Definitions</h2>
        <Badge variant="secondary">{data.totalCount} deployed</Badge>
      </div>

      <div className="grid gap-3">
        {data.definitions.map((def) => (
          <Card key={def.id} className="gap-0 py-0 shadow-none">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <h3 className="font-medium">{def.name ?? def.key}</h3>
                <p className="text-muted-foreground font-mono text-sm">{def.key}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground text-sm">v{def.version}</span>
                {def.versionTag && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    {def.versionTag}
                  </Badge>
                )}
                {def.suspended ? (
                  <Badge variant="secondary" className="bg-warning/10 text-warning-foreground">
                    Suspended
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-success/10 text-success-foreground">
                    Active
                  </Badge>
                )}
                <AskAiButton
                  variant="subtle"
                  prompt={`Assess the operational health of process definition \`${def.key}\` (version v${def.version}${def.versionTag ? ", tag " + def.versionTag : ""}) on engine ${data.engineId}. First call analytics_analyze_process_performance with processDefinitionKey="${def.key}", period="7d", includeActivityBreakdown=true to get throughput, P50/P95 duration and the incident-based failure rate with a per-activity breakdown. Then call camunda7_list_incidents with processDefinitionId filtered to this definition (resolve the id from \`${def.key}\` v${def.version} via camunda7_list_process_definitions if needed) to see live open incidents. Summarise: is this definition healthy or degraded, which activities are the worst offenders, the dominant incident message(s), and the single most likely root cause. End with one concrete recommended next step (e.g. retry jobs, fix variable, redeploy). Do not mutate anything.`}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
