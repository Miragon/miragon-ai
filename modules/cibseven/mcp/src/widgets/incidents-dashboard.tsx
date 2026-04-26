import { useMemo, useState } from "react"
import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"

import type {
  IncidentsDashboardActivity,
  IncidentsDashboardData,
  IncidentsDashboardProcess,
} from "@miragon-ai/client-cibseven"

import { CAMUNDA7_SHOW_PROCESS_INCIDENTS } from "../tool-names.js"

import {
  CountPill,
  FilterBar,
  GroupCard,
  KpiGrid,
  LivePill,
  SectionHeading,
  WidgetHeader,
  WidgetShell,
  useHostActions,
  type FilterChip,
  type HostActions,
  type ToneVariant,
} from "@miragon-ai/widget-shell/widgets"

export type { IncidentsDashboardData }

const TYPE_ALL = "all"
const TYPE_LAST24H = "last24h"
/** Threshold above which a process is rendered with a "critical" tone in the
 *  process group cards. Computed from the unfiltered incident count so the
 *  visual severity stays stable when the user toggles a filter chip. */
const CRITICAL_INCIDENT_THRESHOLD = 50

function severityTone(unfilteredIncidentCount: number): ToneVariant {
  return unfilteredIncidentCount >= CRITICAL_INCIDENT_THRESHOLD ? "critical" : "warning"
}

interface DisplayProcess extends IncidentsDashboardProcess {
  tone: ToneVariant
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString()
}

function ProcessSummary({
  process,
  expanded,
  onOpenDetail,
  onOpenCockpit,
}: {
  process: DisplayProcess
  expanded: boolean
  onOpenDetail: () => void
  onOpenCockpit: (url: string) => void
}) {
  const tone = process.tone
  const dotClass = tone === "critical" ? "bg-critical" : "bg-warning"

  return (
    <div
      className={`grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] items-center gap-4 px-4 py-3 ${
        expanded ? "border-line border-b" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="text-ink flex items-center gap-2 text-sm font-semibold">
          <span className={`size-1.5 rounded-full ${dotClass}`} />
          <span className="truncate">
            {process.processDefinitionName ?? process.processDefinitionKey}
          </span>
          {process.version !== null && (
            <code className="text-ink-subtle font-mono text-xs font-normal">
              v{process.version}
            </code>
          )}
        </div>
        <div className="text-ink-subtle font-mono text-xs">
          {process.affectedActivityCount}{" "}
          {process.affectedActivityCount === 1 ? "activity" : "activities"} ·{" "}
          {process.runningInstances !== null
            ? `${process.runningInstances.toLocaleString()} instances`
            : "instances unknown"}{" "}
          · last {formatTimestamp(process.latestIncident)}
        </div>
      </div>
      <div className="text-ink-muted text-right text-xs tabular-nums">
        <div className="text-ink font-semibold">
          {process.affectedActivityCount}
          {process.totalActivityCount !== null && (
            <span className="text-ink-subtle font-normal"> /{process.totalActivityCount}</span>
          )}
        </div>
        <div>activities</div>
      </div>
      <div className="text-ink-muted text-right text-xs tabular-nums">
        <div className="text-ink font-semibold">+{process.last24hCount}</div>
        <div>last 24h</div>
      </div>
      <CountPill tone={tone}>{process.incidentCount}</CountPill>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onOpenDetail()
        }}
        className="bg-m-blue-soft text-m-blue hover:bg-m-blue/10 inline-flex items-center gap-1 rounded-md border border-transparent px-2.5 py-1 text-xs font-semibold"
      >
        Open detail <span aria-hidden>→</span>
      </button>
      {process.cockpitUrl ? (
        <a
          href={process.cockpitUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onOpenCockpit(process.cockpitUrl)
          }}
          aria-label={`Open ${process.processDefinitionName ?? process.processDefinitionKey} in Cockpit`}
          className="text-ink-muted border-line hover:text-ink hover:bg-line-soft inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium"
        >
          <span aria-hidden="true">▦</span> Cockpit
        </a>
      ) : (
        <span />
      )}
      <span
        aria-hidden="true"
        className={`text-ink-subtle inline-block w-3 text-center text-xs transition-transform ${
          expanded ? "rotate-90" : ""
        }`}
      >
        ▶
      </span>
    </div>
  )
}

function ActivityRow({ activity }: { activity: IncidentsDashboardActivity }) {
  return (
    <div className="border-line-soft text-ink grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 border-b px-4 py-3 pl-7 last:border-b-0">
      <div className="bg-critical-soft text-critical grid size-[18px] place-items-center rounded-full text-[10px] font-bold">
        !
      </div>
      <div className="min-w-0">
        <div className="text-ink truncate text-sm font-semibold">
          {activity.activityName ?? activity.activityId}
        </div>
        <div className="text-ink-muted truncate font-mono text-xs">
          {activity.representativeMessage ?? activity.activityId}
        </div>
      </div>
      <div className="text-ink-subtle text-right font-mono text-[11px]">
        first seen
        <br />
        {formatTimestamp(activity.firstSeen)}
      </div>
      <CountPill tone="critical">{activity.incidentCount}</CountPill>
    </div>
  )
}

function ActivityList({ activities }: { activities: IncidentsDashboardActivity[] }) {
  return (
    <div className="bg-bg">
      {activities.map((a) => (
        <ActivityRow key={a.activityId} activity={a} />
      ))}
    </div>
  )
}

export function IncidentsDashboardWidget({ data }: { data: IncidentsDashboardData | null }) {
  const host: HostActions = useHostActions()

  const [search, setSearch] = useState("")
  const [activeChip, setActiveChip] = useState<string>(TYPE_ALL)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const filteredProcesses = useMemo<DisplayProcess[]>(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const isFiltering = q.length > 0 || activeChip !== TYPE_ALL
    const showLast24h = activeChip === TYPE_LAST24H

    return data.processes
      .map<DisplayProcess | null>((p) => {
        // 1. Chip-based pre-filter (e.g. Last 24h).
        let activities = showLast24h ? p.activities.filter((a) => a.last24hCount > 0) : p.activities

        // 2. Search filter. If the process metadata matches, keep all
        //    chip-filtered activities; otherwise only activities whose own
        //    fields match.
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

        // 3. Drop processes that have nothing to show under any active filter.
        if (isFiltering && activities.length === 0) return null

        // 4. Recompute the visible counts so the card header reflects the
        //    filtered slice (rather than the unfiltered totals). When the
        //    Last-24h chip is active, count only recent incidents; otherwise
        //    count all incidents on the surviving activities.
        const incidentCount = activities.reduce(
          (sum, a) => sum + (showLast24h ? a.last24hCount : a.incidentCount),
          0,
        )
        return {
          ...p,
          activities,
          incidentCount,
          affectedActivityCount: activities.length,
          // Tone is derived from the unfiltered count so the visual severity
          // stays stable when the user toggles a filter.
          tone: severityTone(p.incidentCount),
        }
      })
      .filter((p): p is DisplayProcess => p !== null)
  }, [data, search, activeChip])

  if (!data) {
    return (
      <WidgetShell>
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </WidgetShell>
    )
  }

  const chips: FilterChip[] = [
    {
      id: TYPE_ALL,
      label: "All",
      count: data.totalCount,
      active: activeChip === TYPE_ALL,
    },
    {
      id: TYPE_LAST24H,
      label: "⏱ Last 24h",
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
    host.showWidget(
      `Show me the incidents detail for process \`${processDefinitionKey}\` (use ${CAMUNDA7_SHOW_PROCESS_INCIDENTS})`,
    )
  }

  return (
    <WidgetShell>
      <WidgetHeader
        icon="⚠"
        iconTone="critical"
        title="Incidents"
        sub={
          <>
            <LivePill>Live</LivePill>
            <span>
              {data.totalCount} open across {data.processCount}{" "}
              {data.processCount === 1 ? "process" : "processes"}
              {data.latestIncident && <> · last event {formatTimestamp(data.latestIncident)}</>}
            </span>
          </>
        }
      />

      <KpiGrid
        boxed
        header={{ label: "Overview", badge: "Open incidents · letzte 24h" }}
        cells={[
          {
            label: "Open Incidents",
            value: data.totalCount,
            tone: data.totalCount > 0 ? "critical" : undefined,
          },
          {
            label: "Processes affected",
            value: data.processCount,
          },
          {
            label: "Activities affected",
            value: data.affectedActivityCount,
          },
          {
            label: "+24h",
            value: `+${data.last24hCount}`,
            tone: data.last24hCount > 0 ? "critical" : undefined,
          },
        ]}
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Filter incidents — by process, activity, error message…"
        chips={chips}
        onChipToggle={(id) => setActiveChip(id === activeChip ? TYPE_ALL : id)}
      />

      <section>
        <SectionHeading title="Grouped by process" hint="click to expand activities" />

        {filteredProcesses.length === 0 ? (
          <div className="border-line text-ink-muted bg-card rounded-lg border p-8 text-center text-sm">
            {data.processes.length === 0
              ? "No open incidents"
              : "No processes match the current filter"}
          </div>
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
                  onOpenDetail={() => openDetail(p.processDefinitionKey)}
                  onOpenCockpit={host.openLink}
                />
              }
            >
              <ActivityList activities={p.activities} />
            </GroupCard>
          ))
        )}
      </section>
    </WidgetShell>
  )
}
