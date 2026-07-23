import {
  AskAiButton,
  DrillButton,
  KpiGrid,
  LogText,
  RowCard,
  StatusBadge,
  WidgetHeader,
  formatTimestamp,
  truncate,
  useDetailView,
} from "@miragon-ai/widget-shell/widgets"
import { ModelContext } from "mcp-use/react"
import type { ClusterDetailData } from "../view-models.js"
import { DetailPage } from "./detail-page.js"
import { useNav } from "./navigation.js"
import { CAMUNDA7_CLUSTER_DETAIL_DATA } from "../tool-names.js"
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
  const { data, guard } = useDetailView<ClusterDetailData>({
    initialData,
    key: [
      "camunda7:cluster-detail",
      engine ?? null,
      activityId ?? null,
      incidentType ?? null,
      messageSignature ?? null,
    ],
    tool: CAMUNDA7_CLUSTER_DETAIL_DATA,
    args: { engine, activityId, incidentType, messageSignature },
    ready,
    loadingText: t("clusterDetail.loading"),
    emptyText: t("clusterDetail.noData"),
  })

  if (!data) return guard

  const engineId = engine ?? data.engineId

  return (
    <DetailPage
      header={
        <WidgetHeader
          icon="⚠"
          iconTone="critical"
          title={data.activityId}
          sub={
            <span>
              <StatusBadge tone="critical">{data.incidentType}</StatusBadge>
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
      }
      kpi={
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
      }
      /* Deliberately a single content block, no tabs: splitting the failure
         message from the affected instances would separate the message from
         its context. */
      content={
        <>
          {data.representativeMessage && (
            <div className="text-sm">
              <span className="text-muted-foreground font-medium">
                {t("clusterDetail.failureMessage")}
              </span>
              <LogText text={data.representativeMessage} className="mt-1" />
            </div>
          )}

          <section
            aria-label={t("clusterDetail.affectedInstances")}
            className="flex flex-col gap-2"
          >
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
              <RowCard
                // The engine can report rows without an incident id — fall back to
                // instance+timestamp so React keys stay unique per incident row.
                key={row.incidentId || `${row.processInstanceId}-${row.incidentTimestamp}`}
                title={
                  /* Business key first — the operator's order number, not an engine UUID. */
                  <span className="truncate">
                    {row.businessKey ??
                      t("clusterDetail.instanceFallback", {
                        id: truncate(row.processInstanceId, 12),
                      })}
                  </span>
                }
                subtitle={
                  <>
                    {row.processDefinitionKey} · {formatTimestamp(row.incidentTimestamp)}
                  </>
                }
                actions={
                  <>
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
                    {row.incidentId && (
                      <DrillButton
                        onDrill={() => go({ type: "incident-detail", incidentId: row.incidentId })}
                        ariaLabel={t("clusterDetail.openIncidentAria", {
                          ref: row.businessKey ?? row.processInstanceId,
                        })}
                      >
                        {t("clusterDetail.incident")}
                      </DrillButton>
                    )}
                  </>
                }
              />
            ))}
            {data.incidents.length === 0 && (
              <p className="text-muted-foreground py-2 text-sm">
                {t("clusterDetail.noMatchingIncidents")}
              </p>
            )}
          </section>
        </>
      }
    >
      <ModelContext content={describeCluster(data)} />
    </DetailPage>
  )
}

/**
 * Shell-owning entry point registered in the widget registry. The
 * {@link DetailPage} inside {@link ClusterDetailView} brings the WidgetShell
 * (nesting-aware under the cockpit app), so this is a plain delegation.
 */
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
    <ClusterDetailView
      data={data}
      engine={engine}
      activityId={activityId}
      incidentType={incidentType}
      messageSignature={messageSignature}
    />
  )
}
