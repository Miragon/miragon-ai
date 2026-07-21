import { Badge } from "@miragon/mcp-toolkit-ui"
import {
  AskAiButton,
  DrillButton,
  KpiGrid,
  ViewDataState,
  WidgetHeader,
  WidgetShell,
  formatTimestamp,
} from "@miragon-ai/widget-shell/widgets"
import { ModelContext } from "mcp-use/react"
import type { ClusterDetailData } from "../view-models.js"
import { useNav } from "./navigation.js"
import { CAMUNDA7_CLUSTER_DETAIL_DATA } from "../tool-names.js"
import { useViewData } from "./use-view-data.js"
import { remediatePrompt } from "./remediation.js"
import { useT } from "../messages/use-t.js"

/**
 * Grounding line: the agent knows exactly which failure cluster the operator
 * is inspecting, so "fix this" or "why?" needs no restating of scope.
 */
function describeCluster(data: ClusterDetailData): string {
  return (
    `The operator is inspecting ONE failure cluster on engine "${data.engineId}": activity ` +
    `"${data.activityId}" failing as ${data.incidentType} — ${data.incidentCount} incidents ` +
    `(${data.lastHourCount} in the last hour, ${data.last24hCount} in 24h), first seen ` +
    `${data.firstSeen ?? "unknown"}, latest ${data.latestIncident ?? "unknown"}, across process ` +
    `definition(s) ${data.processDefinitionKeys.join(", ") || "unknown"}. Sample message: ` +
    `${data.representativeMessage ?? "(none)"}. The list shows the affected instances with their ` +
    `business keys. Use camunda7_list_incidents / camunda7_get_process_instance to go deeper; ` +
    `propose remediation only scoped to this cluster and never execute without confirmation.`
  )
}

/**
 * Drill-in for ONE failure cluster — the middle layer between the engine
 * overview's cluster list and the single-incident detail. Shows the affected
 * instances business-key-first (the operator's "order number"), the full
 * sample message, and the time profile; remediation stays a guarded handoff
 * to the agent (same prompt as the overview's "Fix").
 */
export function ClusterDetailView({
  data: initialData = null,
  engine,
  activityId,
  incidentType,
  messageSignature,
}: {
  data?: ClusterDetailData | null
  engine?: string
  activityId?: string
  incidentType?: string
  messageSignature?: string
}) {
  const go = useNav()
  const t = useT()
  // Unlike the engine-health feed, this feed REQUIRES the cluster identity —
  // gate the self-fetch on it (the show tool path passes data instead).
  const ready = !!(activityId && incidentType)
  const { data, loading, error } = useViewData<ClusterDetailData>(
    initialData,
    [
      "camunda7:cluster-detail",
      engine ?? null,
      activityId ?? null,
      incidentType ?? null,
      messageSignature ?? null,
    ],
    CAMUNDA7_CLUSTER_DETAIL_DATA,
    { engine, activityId, incidentType, messageSignature },
    ready,
  )

  if (!data) {
    return (
      <ViewDataState
        loading={loading}
        error={error}
        loadingText={t("clusterDetail.loading")}
        emptyText={t("clusterDetail.noData")}
      />
    )
  }

  const engineId = engine ?? data.engineId

  return (
    <>
      <ModelContext content={describeCluster(data)} />
      <WidgetHeader
        icon="⚠"
        iconTone="critical"
        title={data.activityId}
        sub={
          <span>
            <Badge variant="secondary">{data.incidentType}</Badge>
            <span className="ml-2">
              {t("clusterDetail.affectedAcross", {
                count: data.incidentCount,
                keys: data.processDefinitionKeys.join(", ") || t("clusterDetail.unknownKeys"),
              })}
            </span>
          </span>
        }
        actions={
          <AskAiButton
            variant="primary"
            label={t("clusterDetail.fix")}
            prompt={remediatePrompt(
              {
                activityId: data.activityId,
                incidentType: data.incidentType,
                incidentCount: data.incidentCount,
                last24hCount: data.last24hCount,
                processDefinitionKeys: data.processDefinitionKeys,
                representativeMessage: data.representativeMessage,
              },
              engineId,
            )}
          />
        }
      />

      <KpiGrid
        boxed
        cells={[
          { label: t("clusterDetail.kpiAffected"), value: data.incidentCount, tone: "critical" },
          {
            label: t("clusterDetail.kpiNewLastHour"),
            value: data.lastHourCount,
            tone: data.lastHourCount > 0 ? "critical" : undefined,
          },
          {
            label: t("clusterDetail.kpiNew24h"),
            value: data.last24hCount,
            tone: data.last24hCount > 0 ? "warning" : undefined,
          },
          { label: t("clusterDetail.kpiFirstSeen"), value: formatTimestamp(data.firstSeen) },
        ]}
      />

      {data.representativeMessage && (
        <details className="text-sm" open={data.representativeMessage.length <= 160}>
          <summary className="text-muted-foreground cursor-pointer font-medium">
            {t("clusterDetail.failureMessage")}
          </summary>
          <pre className="bg-muted mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded p-2 text-xs">
            {data.representativeMessage}
          </pre>
        </details>
      )}

      <section aria-label={t("clusterDetail.affectedInstances")} className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          {t("clusterDetail.affectedInstances")}
          {data.totalMatching > data.incidents.length
            ? t("clusterDetail.showingOf", {
                shown: data.incidents.length,
                total: data.totalMatching,
              })
            : ""}
        </h3>
        {data.incidents.map((row) => (
          <div
            key={row.incidentId || row.processInstanceId}
            className="border-border flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0">
              {/* Business key first — the operator's order number, not an engine UUID. */}
              <p className="truncate text-sm font-medium">
                {row.businessKey ??
                  t("clusterDetail.instanceFallback", {
                    id: row.processInstanceId.slice(0, 8),
                  })}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {row.processDefinitionKey} · {formatTimestamp(row.incidentTimestamp)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <DrillButton
                onDrill={() =>
                  go({ type: "instance-detail", processInstanceId: row.processInstanceId })
                }
                ariaLabel={t("clusterDetail.openInstanceAria", {
                  ref: row.businessKey ?? row.processInstanceId,
                })}
              >
                {t("clusterDetail.instance")}
              </DrillButton>
              <DrillButton
                onDrill={() => go({ type: "incident-detail", incidentId: row.incidentId })}
                ariaLabel={t("clusterDetail.openIncidentAria", {
                  ref: row.businessKey ?? row.processInstanceId,
                })}
              >
                {t("clusterDetail.incident")}
              </DrillButton>
            </div>
          </div>
        ))}
        {data.incidents.length === 0 && (
          <p className="text-muted-foreground py-2 text-sm">
            {t("clusterDetail.noMatchingIncidents")}
          </p>
        )}
      </section>
    </>
  )
}

export function ClusterDetailWidget({
  data,
  engine,
  activityId,
  incidentType,
  messageSignature,
}: {
  data: ClusterDetailData | null
  engine?: string
  activityId?: string
  incidentType?: string
  messageSignature?: string
}) {
  return (
    <WidgetShell>
      <ClusterDetailView
        data={data}
        engine={engine}
        activityId={activityId}
        incidentType={incidentType}
        messageSignature={messageSignature}
      />
    </WidgetShell>
  )
}
