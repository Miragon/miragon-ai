import {
  AskAiButton,
  DrillButton,
  OpenInCockpitLink,
  StatusBadge,
  VersionChip,
  ViewDataState,
  WidgetHeader,
  WidgetShell,
  formatTimestamp,
  type ToneVariant,
} from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "../../view-models.js"
import { CAMUNDA7_PROCESS_INCIDENTS_DATA } from "../../tool-names.js"
import { useNav } from "../navigation.js"
import { useViewData } from "../use-view-data.js"
import { useT } from "../../messages/use-t.js"

// AI handoff prompt — fully self-contained (engine + concrete ids inlined) so
// the chat follow-up needs no ambient context. The problem-activity list is
// baked in here from the in-scope `data.activities`.
function buildAnalyzePrompt(data: ProcessIncidentsData, title: string, engineId: string): string {
  const problemActivityList =
    data.activities
      .map(
        (a) =>
          `"${a.activityName ?? a.activityId} (${a.activityId}): ${a.incidentCount} incidents"`,
      )
      .join(", ") || "(none reported)"

  const affectedActivities =
    data.totalActivityCount != null
      ? `${data.activities.length} of ${data.totalActivityCount}`
      : `${data.activities.length}`
  return `Triage the health of process definition \`${title}\` (key \`${data.processDefinitionKey}\`${data.version != null ? `, version ${data.version}` : ""}, engine \`${engineId}\`). Current state: ${data.incidentCount} open incident(s), ${data.failedJobs ?? "unknown"} failed job(s), ${affectedActivities} activities affected, ${data.runningInstances ?? "unknown"} running instances. Problem activities: ${problemActivityList}. Use camunda7_list_incidents and camunda7_list_jobs (filter by processDefinitionKey \`${data.processDefinitionKey}\`) to pull the real incident/exception messages, cluster them by root cause, and use camunda7_query_historic_activity_instances to see whether the same failures recur. Tell me: the single most likely root cause per cluster, which activities are symptoms vs. sources, and a concrete recommended fix (batch retry, variable change, modification, or migration). Do NOT mutate anything — diagnosis only.`
}

/** Tone icon + open-incident badge column of the header. */
function HeaderBadge({ data }: { data: ProcessIncidentsData }) {
  const t = useT()
  const remainingCount = data.incidentCount
  // The merged view also renders healthy definitions — only go red (and show
  // the incident badge) when there is actually something on fire.
  const headerTone: ToneVariant = remainingCount > 0 ? "critical" : "info"
  return (
    <div className="flex items-center gap-3">
      <div
        className={`${
          headerTone === "critical"
            ? "bg-critical-soft text-critical"
            : "bg-m-blue-soft text-m-blue"
        } grid size-11 place-items-center rounded-xl text-xl`}
      >
        {headerTone === "critical" ? "⚠" : "⊞"}
      </div>
      {remainingCount > 0 && (
        <StatusBadge tone="critical">
          {remainingCount === 1
            ? t("procIncHeader.openIncidentsOne", { count: remainingCount })
            : t("procIncHeader.openIncidentsOther", { count: remainingCount })}
        </StatusBadge>
      )}
    </div>
  )
}

/** Sub line: definition key, running-instance count, last event, cockpit link. */
function HeaderSub({ data }: { data: ProcessIncidentsData }) {
  const t = useT()
  const cockpitUrl = data.cockpitUrl
  return (
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
              time: formatTimestamp(data.latestIncident),
            })}
          </span>
        </>
      )}
      {cockpitUrl && (
        <OpenInCockpitLink url={cockpitUrl} label={t("procIncHeader.openInCockpit")} />
      )}
    </>
  )
}

/**
 * Header of the unified definition view — the single action home: the primary
 * "Analyze" AI handoff plus the running-instances drill live here, so the
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
  const engineId = engine ?? data.engineId ?? "default"

  const analyzePrompt = buildAnalyzePrompt(data, title, engineId)

  return (
    <WidgetShell>
      <WidgetHeader
        size="detail"
        badge={<HeaderBadge data={data} />}
        title={title}
        titleSuffix={data.version !== null ? <VersionChip version={data.version} /> : undefined}
        sub={<HeaderSub data={data} />}
        actions={<AskAiButton prompt={analyzePrompt} variant="primary" />}
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
