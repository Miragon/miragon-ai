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
import { formatCount } from "../lib/format-count.js"

import {
  AskAiButton,
  DrillButton,
  FilterBar,
  GroupCard,
  OpenInCockpitLink,
  SectionHeading,
  TableEmptyState,
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
  /** The card's count pill: every open incident, or (Last 24h chip) the new ones — null = unknown. */
  shownCount: number | null
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
      subline={
        <>
          {formatCount(process.affectedActivityCount)}{" "}
          {process.affectedActivityCount === 1
            ? t("incidentsList.activitySingular")
            : t("incidentsList.activityPlural")}{" "}
          ·{" "}
          {t("incidentsList.instancesCount", {
            count: process.runningInstances.toLocaleString(),
          })}{" "}
          · {t("incidentsList.lastSeen", { time: formatTimestamp(process.latestIncident) })}
        </>
      }
      stats={[
        {
          value: formatCount(process.affectedActivityCount),
          label: t("incidentsList.activitiesLabel"),
        },
        {
          value: process.last24hCount === null ? formatCount(null) : `+${process.last24hCount}`,
          label: t("incidentsList.last24hLabel"),
        },
      ]}
      count={formatCount(process.shownCount)}
      countTone={tone}
      actions={
        <>
          <AskAiButton
            variant="subtle"
            label={t("incidentsList.analyze")}
            prompt={`Analyze the root cause of the ${process.incidentCount} open incident(s) on process ${process.processDefinitionName ?? process.processDefinitionKey} (key ${process.processDefinitionKey}, all versions; latest version v${process.latestVersion}) on engine ${engineId}. ${process.affectedActivityCount ?? "An unknown number of"} activity/activities are affected, ${process.last24hCount ?? "an unknown number"} new in the last 24h, latest incident ${formatTimestamp(process.latestIncident)}, across roughly ${process.runningInstances} running instances. Use camunda7_list_incidents({ processDefinitionKey: "${process.processDefinitionKey}" }) and camunda7_query_historic_activity_instances to determine whether the failing activities share one root cause, classify the failure (transient/retryable vs. data/config vs. broken model), and recommend a fix — batch retry via camunda7_set_job_retries_batch, a variable correction, an instance modification via camunda7_modify_process_instance, or a model fix requiring redeploy/migration. Report findings and the recommended action; do not execute mutating changes without confirmation.`}
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
      count={activity.scannedIncidentCount}
      className="border-border border-b pl-7 last:border-b-0"
    />
  )
}

/**
 * The card's activity breakdown. It comes from the newest-first recency scan,
 * so when the scan holds only part of the process's incidents the list says
 * so — the exact per-activity counts live in the definition view.
 */
function ActivityList({ process }: { process: DisplayProcess }) {
  const t = useT()
  return (
    <div className="bg-muted">
      {process.scannedIncidentCount < process.incidentCount && (
        <p className="text-muted-foreground border-border border-b px-4 py-2 pl-7 text-xs">
          {t("incidentsList.breakdownPartial", {
            scanned: process.scannedIncidentCount,
            total: process.incidentCount,
          })}
        </p>
      )}
      {process.activities.map((a) => (
        <ActivityRow key={a.activityId} activity={a} />
      ))}
    </div>
  )
}

/** A recency count the scan cannot vouch for (null) may still be non-zero — never filtered out. */
const mayHaveLast24h = (count: number | null) => count === null || count > 0

function matchesSearch(activity: IncidentsDashboardActivity, q: string): boolean {
  return (
    (activity.activityName ?? "").toLowerCase().includes(q) ||
    activity.activityId.toLowerCase().includes(q) ||
    (activity.representativeMessage ?? "").toLowerCase().includes(q)
  )
}

/**
 * The cards the chips + search leave. Filters narrow the LIST — the cards and
 * their activity rows — never the numbers: a card keeps its exact key-wide
 * counts (the Last 24h chip shows the key's exact 24h count instead), because
 * a sum over the scanned breakdown would understate any partially scanned
 * process.
 */
function filterProcesses(
  processes: IncidentsDashboardProcess[],
  search: string,
  showLast24h: boolean,
): DisplayProcess[] {
  const q = search.trim().toLowerCase()
  return processes
    .map<DisplayProcess | null>((p) => {
      if (showLast24h && !mayHaveLast24h(p.last24hCount)) return null
      let activities = showLast24h
        ? p.activities.filter((a) => mayHaveLast24h(a.last24hCount))
        : p.activities
      const processMatches =
        (p.processDefinitionName ?? "").toLowerCase().includes(q) ||
        p.processDefinitionKey.toLowerCase().includes(q)
      if (q.length > 0 && !processMatches) {
        activities = activities.filter((a) => matchesSearch(a, q))
        if (activities.length === 0) return null
      }
      return {
        ...p,
        activities,
        shownCount: showLast24h ? p.last24hCount : p.incidentCount,
        tone: incidentVolumeTone(p.incidentCount),
      }
    })
    .filter((p): p is DisplayProcess => p !== null)
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

  const filteredProcesses = useMemo<DisplayProcess[]>(
    () => (data ? filterProcesses(data.processes, search, activeChip === TYPE_LAST24H) : []),
    [data, search, activeChip],
  )

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
              <ActivityList process={p} />
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
