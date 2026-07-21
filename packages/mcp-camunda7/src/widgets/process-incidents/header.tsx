import {
  AskAiButton,
  OpenInCockpitLink,
  StatusBadge,
  VersionChip,
  ViewDataState,
  WidgetHeader,
  WidgetShell,
  formatTime,
} from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "../../view-models.js"
import { CAMUNDA7_PROCESS_INCIDENTS_DATA } from "../../tool-names.js"
import { useViewData } from "../use-view-data.js"
import { useT } from "../../messages/use-t.js"

export function ProcessDetailHeader({
  data: initialData = null,
  processDefinitionKey,
  engine,
}: {
  data?: ProcessIncidentsData | null
  processDefinitionKey?: string
  engine?: string
}) {
  const t = useT()
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
        <ViewDataState
          loading={loading}
          error={error}
          loadingText={t("procIncHeader.loading")}
          emptyText={t("procIncHeader.noData")}
        />
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
      <WidgetHeader
        size="detail"
        badge={
          <div className="flex items-center gap-3">
            <div className="bg-critical-soft text-critical grid size-11 place-items-center rounded-xl text-xl">
              ⚠
            </div>
            <StatusBadge tone="critical">
              {remainingCount === 1
                ? t("procIncHeader.openIncidentsOne", { count: remainingCount })
                : t("procIncHeader.openIncidentsOther", { count: remainingCount })}
            </StatusBadge>
          </div>
        }
        title={title}
        titleSuffix={data.version !== null ? <VersionChip version={data.version} /> : undefined}
        sub={
          <>
            <span className="font-mono text-xs">{data.processDefinitionKey}</span>
            {data.runningInstances !== null && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>
                  {t("procIncHeader.runningInstances", {
                    count: data.runningInstances.toLocaleString(),
                  })}
                </span>
              </>
            )}
            {data.latestIncident && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>
                  {t("procIncHeader.lastEvent", {
                    time: formatTime(data.latestIncident),
                  })}
                </span>
              </>
            )}
            {cockpitUrl && (
              <OpenInCockpitLink url={cockpitUrl} label={t("procIncHeader.openInCockpit")} />
            )}
          </>
        }
        actions={<AskAiButton prompt={triagePrompt} variant="primary" />}
      />
    </WidgetShell>
  )
}
