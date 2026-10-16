import { useMemo, useState } from "react"

import {
  CountPill,
  FilterBar,
  GroupCard,
  SectionHeading,
  TONE_DOT,
  cn,
  type FilterChip,
  type ToneVariant,
  DrillButton,
} from "@miragon/mcp-toolkit-ui"
import { useViewData } from "@miragon/mcp-toolkit-ui/hooks"
import type {
  IncidentsDashboardActivity,
  IncidentsDashboardData,
  IncidentsDashboardProcess,
} from "../../view-models.js"

import { useNav } from "../navigation.js"
import { CAMUNDA7_INCIDENTS_DATA } from "../../tool-names.js"
import { GroupSummaryRow, IncidentGroupIcon } from "../group-summary-row.js"
import { useHandOff, type HandOff } from "../lib/hand-off.js"
import { MoreActions } from "../lib/more-actions.js"
import { useT } from "../../messages/use-t.js"
import { formatCount } from "../lib/format-count.js"
import { dashboardScope, incidentsFeed } from "./scope.js"

import {
  HandOffButton,
  OpenInCockpitLink,
  TableEmptyState,
  ViewDataState,
  WidgetShell,
  countTone,
  formatNumber,
  formatTimestamp,
} from "@miragon/pulse-widget-shell/widgets"

const TYPE_ALL = "all"
const TYPE_LAST24H = "last24h"

type IncidentChip = typeof TYPE_ALL | typeof TYPE_LAST24H

/**
 * Root cause of ONE process's open incidents — do the failing activities share
 * a cause, and which fix. The process name is the deployer's text — quoted.
 * On a dashboard filtered by incident type the card counts only that type:
 * the filter travels as an id and the count as the matching incidents.
 */
export function processRootCauseHandOff(
  process: IncidentsDashboardProcess,
  engine: string | undefined,
  filters: IncidentsDashboardData["filters"],
): HandOff {
  // The card IS its key — only the incident-type filter narrows its counts.
  const { incidentType } = dashboardScope(filters)
  return {
    intent: "askAi.incidents.processRootCause",
    ids: { engine, processDefinitionKey: process.processDefinitionKey, incidentType },
    // Every count spans all versions of the key (#335 N61); null facts (a
    // scan that does not cover the card) are left out, never a 0.
    facts: {
      countScope: "allVersions",
      latestVersion: process.latestVersion,
      openIncidents: incidentType ? undefined : process.incidentCount,
      matchingIncidents: incidentType ? process.incidentCount : undefined,
      affectedActivities: process.affectedActivityCount,
      last24h: process.last24hCount,
      latestIncident: process.latestIncident,
      runningInstances: process.runningInstances,
    },
    untrusted: [{ label: "processName", text: process.processDefinitionName }],
    tools: [
      "camunda7_list_incidents",
      "camunda7_get_job_stacktrace",
      "camunda7_query_historic_incidents",
      "camunda7_query_historic_activity_instances",
    ],
  }
}

interface DisplayProcess extends IncidentsDashboardProcess {
  tone: ToneVariant
  /** The card's count pill: every open incident, or (Last 24h chip) the new ones — null = unknown. */
  shownCount: number | null
}

/**
 * One process group (#322 U20): two lines instead of one crowded row. Line
 * one is the process by its full name (never cut to "Mirave…") and its
 * count; line two the facts and the ONE drill, "Öffnen" — the link into the
 * vendor's app and the chat hand-off wait behind "more".
 */
function ProcessSummary({
  process,
  expanded,
  engineId,
  vendor,
  filters,
  onOpenDetail,
}: {
  process: DisplayProcess
  expanded: boolean
  /** The engine product (`engineVendor`) — names the link into its web app. */
  vendor: string
  /** The engine the dashboard was fetched from — undefined when the default routed it. */
  engineId: string | undefined
  /** The dashboard's echoed filters — the scope of the card's counts. */
  filters: IncidentsDashboardData["filters"]
  onOpenDetail: () => void
}) {
  const t = useT()
  const { ask } = useHandOff()
  const cockpitUrl = process.cockpitUrl
  const name = process.processDefinitionName ?? process.processDefinitionKey
  const facts = [
    process.affectedActivityCount === null
      ? `${formatCount(null)} ${t("incidentsList.activitiesLabel")}`
      : t("incidentsList.activities", { count: formatNumber(process.affectedActivityCount) }),
    process.last24hCount === null
      ? null
      : t("incidentsList.new24h", { count: formatNumber(process.last24hCount) }),
    t("incidentsList.instancesCount", { count: formatNumber(process.runningInstances) }),
    t("incidentsList.lastSeen", { time: formatTimestamp(process.latestIncident) }),
  ].filter((fact): fact is string => fact !== null)

  return (
    <div className={cn("flex flex-col gap-1.5 px-4 py-3", expanded && "border-border border-b")}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn("mt-2 size-1.5 shrink-0 rounded-full", TONE_DOT[process.tone])}
        />
        <span className="text-foreground text-dense min-w-0 flex-1 font-semibold break-words">
          {name}
          {process.processDefinitionName && (
            <span className="text-muted-foreground text-small ms-2 font-mono font-normal">
              {process.processDefinitionKey}
            </span>
          )}
        </span>
        <CountPill tone={process.tone}>{formatCount(process.shownCount)}</CountPill>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 ps-4">
        <span className="text-muted-foreground text-small min-w-0 flex-1">{facts.join(" · ")}</span>
        <div className="flex items-center gap-1">
          <DrillButton
            onDrill={onOpenDetail}
            ariaLabel={t("incidentsList.openDetailAria", { name })}
          >
            {t("incidentsList.open")}
          </DrillButton>
          <MoreActions label={t("incidentsList.moreActions", { name })}>
            {cockpitUrl && (
              <OpenInCockpitLink url={cockpitUrl} vendor={vendor} variant="menuitem" />
            )}
            <HandOffButton
              action="findCause"
              variant="menuitem"
              prompt={ask(processRootCauseHandOff(process, engineId, filters))}
            />
          </MoreActions>
        </div>
      </div>
    </div>
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
      count={formatNumber(activity.scannedIncidentCount)}
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
        <p className="text-muted-foreground border-border text-small border-b px-4 py-2 pl-7">
          {t("incidentsList.breakdownPartial", {
            scanned: formatNumber(process.scannedIncidentCount),
            total: formatNumber(process.incidentCount),
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
        // The one severity ladder (#322 U14): open incidents are danger.
        tone: countTone(p.incidentCount),
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
  // Shares the overview-kpi feed (key + args) → both incidents panels dedupe
  // to one fetch in the cockpit; standalone the data comes in via props and
  // is never refetched (its filters live in the echo, see incidentsFeed).
  const feed = incidentsFeed(engine)
  const { data, loading, error, refetch } = useViewData<IncidentsDashboardData>(
    initialData,
    feed.key,
    CAMUNDA7_INCIDENTS_DATA,
    feed.args,
    feed.ready,
    { initialDataMode: "seed" },
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
        onRetry={refetch}
        loadingText={t("incidentsList.loading")}
        emptyText={t("incidentsList.noData")}
      />
    )
  }

  const chips: FilterChip[] = [
    {
      id: TYPE_ALL,
      label: t("incidentsList.chipAll"),
      count: formatNumber(data.totalCount),
      active: activeChip === TYPE_ALL,
    },
    {
      id: TYPE_LAST24H,
      label: t("incidentsList.chipLast24h"),
      count: formatNumber(data.last24hCount),
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

  function openDetail(process: IncidentsDashboardProcess) {
    go({
      type: "process-incidents",
      processDefinitionKey: process.processDefinitionKey,
      label: process.processDefinitionName ?? undefined,
    })
  }

  return (
    <>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("incidentsList.searchPlaceholder")}
        searchAriaLabel={t("incidentsList.searchLabel")}
        chips={chips}
        chipsAriaLabel={t("incidentsList.chipsLabel")}
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
                  engineId={engine ?? data.engineId}
                  vendor={data.engineVendor}
                  filters={data.filters}
                  onOpenDetail={() => openDetail(p)}
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
