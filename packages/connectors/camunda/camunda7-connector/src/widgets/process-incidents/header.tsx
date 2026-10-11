import {
  DrillButton,
  OpenInCockpitLink,
  StatusBadge,
  ViewDataState,
  WidgetHeader,
  WidgetShell,
  formatNumber,
  formatTimestamp,
} from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "../../view-models.js"
import { useNav } from "../navigation.js"
import { useHandOff, type HandOff } from "../lib/hand-off.js"
import { HandOffButton } from "../lib/hand-off-button.js"
import { useT } from "../../messages/use-t.js"
import { diagramActivityFraction } from "./activity-scope.js"
import { useDefinitionData } from "./feed.js"

/**
 * Triage of ONE definition's health: cluster its incidents by root cause and
 * recommend a fix per cluster. The problem activities travel as their ids;
 * the definition's name is the deployer's text — quoted.
 */
export function triageProcessHandOff(
  data: ProcessIncidentsData,
  engine: string | undefined,
): HandOff {
  const fraction = diagramActivityFraction(data)
  return {
    intent: "askAi.process.triage",
    ids: { engine, processDefinitionKey: data.processDefinitionKey, noRetriesLeft: true },
    // Every count spans all versions of the key; only the diagram is one
    // version (#335 N60) — so the activity fraction is the diagram's own
    // ("1 of 2"), and activities only older versions have are named apart.
    facts: {
      countScope: "allVersions",
      diagramVersion: data.diagramVersion,
      openIncidents: data.incidentCount,
      failedJobs: data.failedJobs,
      runningInstances: data.runningInstances,
      problemActivities: data.activities.map((a) => a.activityId),
      affectedDiagramActivities: fraction?.affected,
      diagramActivities: fraction?.total,
      affectedOnlyInOlderVersions: fraction?.olderVersionsOnly || undefined,
    },
    untrusted: [{ label: "processName", text: data.processDefinitionName }],
    tools: [
      "camunda7_list_incidents",
      "camunda7_list_jobs",
      "camunda7_get_job_stacktrace",
      "camunda7_query_historic_incidents",
      "camunda7_query_historic_activity_instances",
    ],
  }
}

/**
 * The open-incident badge of the header. The merged view also renders healthy
 * definitions — the badge appears only when there is something on fire.
 */
function HeaderBadge({ data }: { data: ProcessIncidentsData }) {
  const t = useT()
  if (data.incidentCount === 0) return null
  return (
    <StatusBadge tone="danger">
      {t("procIncHeader.openIncidents", { count: formatNumber(data.incidentCount) })}
    </StatusBadge>
  )
}

/**
 * Sub line: definition key + its scope (every version — the view is key-wide),
 * running-instance count, last event, cockpit link.
 */
function HeaderSub({ data }: { data: ProcessIncidentsData }) {
  const t = useT()
  const cockpitUrl = data.cockpitUrl
  return (
    <>
      <span className="font-mono text-xs">{data.processDefinitionKey}</span>
      <span className="text-muted-foreground">·</span>
      <span>{t("procIncHeader.allVersions")}</span>
      <span className="text-muted-foreground">·</span>
      <span>
        {t("procIncHeader.runningInstances", { count: formatNumber(data.runningInstances) })}
      </span>
      {data.latestIncident && (
        <>
          <span className="text-muted-foreground">·</span>
          <span>
            {t("procIncHeader.lastEvent", {
              time: formatTimestamp(data.latestIncident),
            })}
          </span>
        </>
      )}
      {cockpitUrl && <OpenInCockpitLink url={cockpitUrl} vendor={data.engineVendor} />}
    </>
  )
}

/**
 * Header of the unified definition view — the single action home: the primary
 * chat hand-off plus the running-instances drill live here, so the
 * section widgets below stay action-free.
 */
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
  const go = useNav()
  const { ask } = useHandOff()
  const { data, loading, error, refetch } = useDefinitionData(
    initialData,
    processDefinitionKey,
    engine,
  )

  if (!data) {
    return (
      <WidgetShell>
        <ViewDataState
          loading={loading}
          error={error}
          loadingText={t("procIncHeader.loading")}
          emptyText={t("procIncHeader.noData")}
          onRetry={refetch}
          retryLabel={t("viewState.retry")}
        />
      </WidgetShell>
    )
  }

  const title = data.processDefinitionName ?? data.processDefinitionKey

  return (
    <WidgetShell>
      <WidgetHeader
        size="detail"
        badge={<HeaderBadge data={data} />}
        title={title}
        sub={<HeaderSub data={data} />}
        actions={
          <HandOffButton
            action="assess"
            variant="primary"
            prompt={ask(triageProcessHandOff(data, engine ?? data.engineId))}
          />
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <DrillButton
          size="md"
          onDrill={() =>
            go({ type: "process-instances", processDefinitionKey: data.processDefinitionKey })
          }
        >
          {t("procIncHeader.viewRunningInstances")}
        </DrillButton>
      </div>
    </WidgetShell>
  )
}
