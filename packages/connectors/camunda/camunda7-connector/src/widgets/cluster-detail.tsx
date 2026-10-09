import {
  AskAiButton,
  DrillButton,
  FilterBar,
  KpiGrid,
  LogText,
  RowCard,
  StatusBadge,
  TableEmptyState,
  ViewDataState,
  WidgetHeader,
  WidgetShell,
  formatTimestamp,
  truncate,
  usePagedListView,
} from "@miragon-ai/widget-shell/widgets"
import { HostModelContext } from "@miragon/mcp-toolkit-ui/app"
import type { ClusterDetailData, ClusterIncidentRow } from "../view-models.js"
import { DetailPage } from "./detail-page.js"
import { CockpitListFooter } from "./list-footer.js"
import { useNav } from "./navigation.js"
import { CAMUNDA7_CLUSTER_DETAIL_DATA } from "../tool-names.js"
import { clusterCountFacts, remediationHandOff } from "./remediation.js"
import { useHandOff, type ViewContext } from "./lib/hand-off.js"
import { formatCount, formatCountAtLeast } from "./lib/format-count.js"
import { useT } from "../messages/use-t.js"

/** Page size — mirrors the server default (`CLUSTER_DETAIL_ROWS`). */
const PAGE_SIZE = 50

/**
 * Grounding context: the agent knows exactly which failure cluster the
 * operator is inspecting, so "fix this" or "why?" needs no restating of scope.
 * The sample message is engine text — quoted, never inlined.
 */
export function describeCluster(data: ClusterDetailData): ViewContext {
  return {
    summary:
      "The operator is inspecting ONE failure cluster and its affected instances (with their business keys). Propose remediation only scoped to this cluster.",
    ids: {
      engine: data.engineId,
      activityId: data.activityId,
      incidentType: data.incidentType,
      processDefinitionKeyIn: data.processDefinitionKeys,
    },
    // Counts a capped scan cannot vouch for are a lower bound or left out —
    // never a 0 (#335); the list then covers only the newest scanned ones.
    facts: {
      ...clusterCountFacts(data),
      lastHour: data.lastHourCount,
      last24h: data.last24hCount,
      firstSeen: data.firstSeen,
      latestIncident: data.latestIncident,
      listCoversNewest: listCapped(data) ? data.scannedIncidentCount : undefined,
    },
    untrusted: [{ label: "sampleMessage", text: data.representativeMessage }],
    tools: ["camunda7_list_incidents", "camunda7_get_process_instance"],
  }
}

/**
 * Cluster identity + engine from props (cockpit drill) or the handed-in
 * data (standalone show-tool render) — loadMore() must always carry both,
 * or it would page the caller's default engine instead of the origin engine.
 */
function clusterFeedParams({
  initialData,
  engine,
  activityId,
  incidentType,
  messageSignature,
}: {
  initialData: ClusterDetailData | null
  engine?: string
  activityId?: string
  incidentType?: string
  messageSignature?: string
}) {
  const clusterActivityId = activityId ?? initialData?.activityId
  const clusterIncidentType = incidentType ?? initialData?.incidentType
  const clusterSignature = messageSignature ?? initialData?.messageSignature ?? undefined
  const feedEngine = engine ?? initialData?.engineId
  // Unlike the engine-health feed, this feed REQUIRES the cluster identity —
  // gate the self-fetch on it (the show tool path passes data instead).
  const ready = !!(clusterActivityId && clusterIncidentType)
  const args: Record<string, unknown> = {}
  if (feedEngine) args.engine = feedEngine
  if (clusterActivityId) args.activityId = clusterActivityId
  if (clusterIncidentType) args.incidentType = clusterIncidentType
  if (clusterSignature) args.messageSignature = clusterSignature
  return { clusterActivityId, clusterIncidentType, clusterSignature, feedEngine, ready, args }
}

/** Header block: failing activity, incident-type badge, and the guarded "Fix" handoff. */
function ClusterHeader({ data, engineId }: { data: ClusterDetailData; engineId: string }) {
  const t = useT()
  const { ask, surface } = useHandOff()
  const { handOff, canFix } = remediationHandOff(
    {
      activityId: data.activityId,
      incidentType: data.incidentType,
      incidentCount: data.incidentCount,
      scannedIncidentCount: data.scannedIncidentCount,
      last24hCount: data.last24hCount,
      processDefinitionKeys: data.processDefinitionKeys,
      representativeMessage: data.representativeMessage,
    },
    engineId,
    surface,
  )
  return (
    <WidgetHeader
      icon="⚠"
      iconTone="critical"
      title={data.activityId}
      sub={
        <span>
          <StatusBadge tone="critical">{data.incidentType}</StatusBadge>
          <span className="ml-2">
            {t("clusterDetail.affectedAcross", {
              count: formatCountAtLeast(data.incidentCount, data.scannedIncidentCount),
              keys: data.processDefinitionKeys.join(", ") || t("clusterDetail.unknownKeys"),
            })}
          </span>
        </span>
      }
      actions={
        <AskAiButton
          variant="primary"
          label={canFix ? t("clusterDetail.fix") : t("askAi.cluster.diagnoseLabel")}
          prompt={ask(handOff)}
        />
      }
    />
  )
}

/**
 * KPI row: affected total plus the last-hour / 24h freshness profile. A count
 * a capped scan cannot vouch for renders as a lower bound ("≥2,000") or "—".
 */
function ClusterKpis({ data }: { data: ClusterDetailData }) {
  const t = useT()
  return (
    <KpiGrid
      boxed
      cells={[
        {
          label: t("clusterDetail.kpiAffected"),
          value: formatCountAtLeast(data.incidentCount, data.scannedIncidentCount),
          tone: "critical",
        },
        {
          label: t("clusterDetail.kpiNewLastHour"),
          value: formatCount(data.lastHourCount),
          tone: data.lastHourCount ? "critical" : undefined,
        },
        {
          label: t("clusterDetail.kpiNew24h"),
          value: formatCount(data.last24hCount),
          tone: data.last24hCount ? "warning" : undefined,
        },
        { label: t("clusterDetail.kpiFirstSeen"), value: formatTimestamp(data.firstSeen) },
      ]}
    />
  )
}

/**
 * The list pages over the scanned incidents: when the cluster outruns the
 * scan (its total is unknown, or larger), the footer's total is the scan's
 * share — said so beneath it instead of passing for the cluster's size.
 */
function listCapped(data: ClusterDetailData): boolean {
  return data.incidentCount === null || data.incidentCount > data.scannedIncidentCount
}

/** One affected instance row with its instance/incident drill actions. */
function IncidentRow({ row }: { row: ClusterIncidentRow }) {
  const go = useNav()
  const t = useT()
  return (
    <RowCard
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
  const t = useT()
  const { clusterActivityId, clusterIncidentType, clusterSignature, feedEngine, ready, args } =
    clusterFeedParams({ initialData, engine, activityId, incidentType, messageSignature })
  // The business-key search is SERVER-side (the feed intersects with a
  // /process-instance lookup) so it covers the whole cluster, not just the
  // loaded page.
  const { paged, search, setSearch, interacted } = usePagedListView<
    ClusterIncidentRow,
    ClusterDetailData
  >({
    initialData,
    key: [
      "camunda7:cluster-detail",
      feedEngine ?? null,
      clusterActivityId ?? null,
      clusterIncidentType ?? null,
      clusterSignature ?? null,
    ],
    tool: CAMUNDA7_CLUSTER_DETAIL_DATA,
    args,
    searchArg: "businessKeyLike",
    pageSize: PAGE_SIZE,
    ready,
    selectItems: (d) => d.incidents,
    selectTotal: (d) => d.totalMatching,
  })
  const data = paged.firstPage

  if (!data) {
    return (
      <WidgetShell>
        <ViewDataState
          loading={paged.loading}
          error={paged.error}
          loadingText={t("clusterDetail.loading")}
          emptyText={t("clusterDetail.noData")}
        />
      </WidgetShell>
    )
  }

  const engineId = engine ?? data.engineId

  return (
    <DetailPage
      header={<ClusterHeader data={data} engineId={engineId} />}
      kpi={<ClusterKpis data={data} />}
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
            <h3 className="text-sm font-semibold">{t("clusterDetail.affectedInstances")}</h3>
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder={t("clusterDetail.searchPlaceholder")}
              chips={[]}
              onChipToggle={() => undefined}
            />
            {paged.items.map((row) => (
              <IncidentRow
                // The engine can report rows without an incident id — fall back to
                // instance+timestamp so React keys stay unique per incident row.
                key={row.incidentId || `${row.processInstanceId}-${row.incidentTimestamp}`}
                row={row}
              />
            ))}
            {paged.items.length === 0 && (
              <TableEmptyState>
                {interacted ? t("clusterDetail.noMatch") : t("clusterDetail.noMatchingIncidents")}
              </TableEmptyState>
            )}
            <CockpitListFooter paged={paged} noun={t("clusterDetail.footerNoun")} />
            {listCapped(data) && (
              <p className="text-muted-foreground text-xs">
                {t("clusterDetail.listCapped", {
                  count: data.scannedIncidentCount.toLocaleString(),
                })}
              </p>
            )}
          </section>
        </>
      }
    >
      <ClusterModelContext data={data} />
    </DetailPage>
  )
}

function ClusterModelContext({ data }: { data: ClusterDetailData }) {
  const { context } = useHandOff()
  return <HostModelContext content={context(describeCluster(data))}>{null}</HostModelContext>
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
