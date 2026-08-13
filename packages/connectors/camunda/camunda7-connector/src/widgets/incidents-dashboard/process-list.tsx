import { useMemo, useState } from "react"

import type {
  IncidentsDashboardActivity,
  IncidentsDashboardData,
  IncidentsDashboardProcess,
} from "../../view-models.js"

import { useNav } from "../navigation.js"
import { CAMUNDA7_INCIDENTS_DATA } from "../../tool-names.js"
import { GroupSummaryRow, IncidentGroupIcon } from "../group-summary-row.js"
import { useViewData } from "../use-view-data.js"
import { useT } from "../../messages/use-t.js"

import {
  AskAiButton,
  DrillButton,
  FilterBar,
  GroupCard,
  OpenInCockpitLink,
  SectionHeading,
  TableEmptyState,
  VersionChip,
  ViewDataState,
  WidgetShell,
  formatTimestamp,
  type FilterChip,
  type ToneVariant,
} from "@miragon-ai/widget-shell/widgets"

const TYPE_ALL = "all"
const TYPE_LAST24H = "last24h"

type IncidentChip = typeof TYPE_ALL | typeof TYPE_LAST24H

/** Threshold above which a process is rendered with a "critical" tone in the
 *  process group cards. Computed from the unfiltered incident count so the
 *  visual severity stays stable when the user toggles a filter chip. */
const CRITICAL_INCIDENT_THRESHOLD = 50

// Named for its semantics (sheer incident volume) — distinct from the
// failed-jobs/incidents/instances severity ladder in cockpit-dashboard/lib.ts.
function incidentVolumeTone(unfilteredIncidentCount: number): ToneVariant {
  return unfilteredIncidentCount >= CRITICAL_INCIDENT_THRESHOLD ? "critical" : "warning"
}

interface DisplayProcess extends IncidentsDashboardProcess {
  tone: ToneVariant
}

function ProcessSummary({
  process,
  expanded,
  engineId,
  onOpenDetail,
}: {
  process: DisplayProcess
  expanded: boolean
  engineId: string
  onOpenDetail: () => void
}) {
  const t = useT()
  const tone = process.tone
  const cockpitUrl = process.cockpitUrl

  return (
    <GroupSummaryRow
      tone={tone}
      title={process.processDefinitionName ?? process.processDefinitionKey}
      titleSuffix={
        process.version !== null ? <VersionChip version={process.version} className="ml-0" /> : null
      }
      subline={
        <>
          {process.affectedActivityCount}{" "}
          {process.affectedActivityCount === 1
            ? t("incidentsList.activitySingular")
            : t("incidentsList.activityPlural")}{" "}
          ·{" "}
          {process.runningInstances !== null
            ? t("incidentsList.instancesCount", {
                count: process.runningInstances.toLocaleString(),
              })
            : t("incidentsList.instancesUnknown")}{" "}
          · {t("incidentsList.lastSeen", { time: formatTimestamp(process.latestIncident) })}
        </>
      }
      stats={[
        {
          value: (
            <>
              {process.affectedActivityCount}
              {process.totalActivityCount !== null && (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  /{process.totalActivityCount}
                </span>
              )}
            </>
          ),
          label: t("incidentsList.activitiesLabel"),
        },
        { value: `+${process.last24hCount}`, label: t("incidentsList.last24hLabel") },
      ]}
      count={process.incidentCount}
      countTone={tone}
      actions={
        <>
          <AskAiButton
            variant="subtle"
            label={t("incidentsList.analyze")}
            prompt={`Analyze the root cause of the ${process.incidentCount} open incident(s) on process ${process.processDefinitionName ?? process.processDefinitionKey} (key ${process.processDefinitionKey}, version v${process.version ?? "n/a"}) on engine ${engineId}. ${process.affectedActivityCount} activity/activities are affected, ${process.last24hCount} new in the last 24h, latest incident ${formatTimestamp(process.latestIncident)}, across roughly ${process.runningInstances ?? "unknown"} running instances. Use camunda7_list_incidents (filtered to processDefinitionKey ${process.processDefinitionKey}) and camunda7_query_historic_activity_instances to determine whether the failing activities share one root cause, classify the failure (transient/retryable vs. data/config vs. broken model), and recommend a fix — batch retry via camunda7_set_job_retries_batch, a variable correction, an instance modification via camunda7_modify_process_instance, or a model fix requiring redeploy/migration. Report findings and the recommended action; do not execute mutating changes without confirmation.`}
          />
          <DrillButton
            onDrill={onOpenDetail}
            ariaLabel={t("incidentsList.openDetailAria", {
              name: process.processDefinitionName ?? process.processDefinitionKey,
            })}
          >
            {t("incidentsList.open")}
          </DrillButton>
          {cockpitUrl ? <OpenInCockpitLink url={cockpitUrl} /> : <span />}
        </>
      }
      expanded={expanded}
    />
  )
}

function ActivityRow({ activity }: { activity: IncidentsDashboardActivity }) {
  const t = useT()
  return (
    <GroupSummaryRow
      icon={<IncidentGroupIcon />}
      title={activity.activityName ?? activity.activityId}
      subline={activity.representativeMessage ?? activity.activityId}
      stats={[{ value: formatTimestamp(activity.firstSeen), label: t("incidentsList.firstSeen") }]}
      count={activity.incidentCount}
      className="border-border border-b pl-7 last:border-b-0"
    />
  )
}

function ActivityList({ activities }: { activities: IncidentsDashboardActivity[] }) {
  return (
    <div className="bg-muted">
      {activities.map((a) => (
        <ActivityRow key={a.activityId} activity={a} />
      ))}
    </div>
  )
}

/**
 * Filter bar + grouped process list. Combined into one widget because the
 * search/chip state has to drive the visible process rows — splitting them
 * apart would force the filter state through global storage just to avoid
 * one shared `useState`.
 */
export function IncidentProcessListView({
  data: initialData = null,
  engine,
}: {
  data?: IncidentsDashboardData | null
  engine?: string
}) {
  const go = useNav()
  const t = useT()
  // Shares the overview-kpi query key → both incidents panels dedupe to one
  // fetch in the cockpit; standalone the data comes in via props.
  const { data, loading, error } = useViewData<IncidentsDashboardData>(
    initialData,
    ["camunda7:incidents", engine ?? null],
    CAMUNDA7_INCIDENTS_DATA,
    { engine },
    !!engine,
  )

  const [search, setSearch] = useState("")
  const [activeChip, setActiveChip] = useState<IncidentChip>(TYPE_ALL)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const filteredProcesses = useMemo<DisplayProcess[]>(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const isFiltering = q.length > 0 || activeChip !== TYPE_ALL
    const showLast24h = activeChip === TYPE_LAST24H

    return data.processes
      .map<DisplayProcess | null>((p) => {
        let activities = showLast24h ? p.activities.filter((a) => a.last24hCount > 0) : p.activities

        const processMatchesSearch =
          q.length === 0 ||
          (p.processDefinitionName ?? "").toLowerCase().includes(q) ||
          p.processDefinitionKey.toLowerCase().includes(q)

        if (q.length > 0 && !processMatchesSearch) {
          activities = activities.filter(
            (a) =>
              (a.activityName ?? "").toLowerCase().includes(q) ||
              a.activityId.toLowerCase().includes(q) ||
              (a.representativeMessage ?? "").toLowerCase().includes(q),
          )
        }

        if (isFiltering && activities.length === 0) return null

        const incidentCount = activities.reduce(
          (sum, a) => sum + (showLast24h ? a.last24hCount : a.incidentCount),
          0,
        )
        return {
          ...p,
          activities,
          incidentCount,
          affectedActivityCount: activities.length,
          tone: incidentVolumeTone(p.incidentCount),
        }
      })
      .filter((p): p is DisplayProcess => p !== null)
  }, [data, search, activeChip])

  if (!data) {
    return (
      <ViewDataState
        loading={loading}
        error={error}
        loadingText={t("incidentsList.loading")}
        emptyText={t("incidentsList.noData")}
      />
    )
  }

  const chips: FilterChip[] = [
    {
      id: TYPE_ALL,
      label: t("incidentsList.chipAll"),
      count: data.totalCount,
      active: activeChip === TYPE_ALL,
    },
    {
      id: TYPE_LAST24H,
      label: t("incidentsList.chipLast24h"),
      count: data.last24hCount,
      active: activeChip === TYPE_LAST24H,
    },
  ]

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openDetail(processDefinitionKey: string) {
    go({ type: "process-incidents", processDefinitionKey })
  }

  return (
    <>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("incidentsList.searchPlaceholder")}
        chips={chips}
        onChipToggle={(id) => setActiveChip(id === activeChip ? TYPE_ALL : (id as IncidentChip))}
      />

      <section>
        <SectionHeading
          title={t("incidentsList.groupedByProcess")}
          hint={t("incidentsList.clickToExpand")}
        />

        {filteredProcesses.length === 0 ? (
          <TableEmptyState>
            {data.processes.length === 0
              ? t("incidentsList.noOpenIncidents")
              : t("incidentsList.noMatch")}
          </TableEmptyState>
        ) : (
          filteredProcesses.map((p) => (
            <GroupCard
              key={p.processDefinitionKey}
              expanded={expanded.has(p.processDefinitionKey)}
              onToggle={() => toggleExpanded(p.processDefinitionKey)}
              summary={
                <ProcessSummary
                  process={p}
                  expanded={expanded.has(p.processDefinitionKey)}
                  engineId={engine ?? data.engineId ?? "default"}
                  onOpenDetail={() => openDetail(p.processDefinitionKey)}
                />
              }
            >
              <ActivityList activities={p.activities} />
            </GroupCard>
          ))
        )}
      </section>
    </>
  )
}

export function IncidentProcessList({
  data,
  engine,
}: {
  data: IncidentsDashboardData | null
  engine?: string
}) {
  return (
    <WidgetShell>
      <IncidentProcessListView data={data} engine={engine} />
    </WidgetShell>
  )
}
