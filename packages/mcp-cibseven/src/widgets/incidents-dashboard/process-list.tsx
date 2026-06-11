import { useMemo, useState } from "react"
import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"

import type {
  IncidentsDashboardActivity,
  IncidentsDashboardData,
  IncidentsDashboardProcess,
} from "../../view-models.js"

import { useNav } from "../navigation.js"
import { CAMUNDA7_INCIDENTS_DATA } from "../../tool-names.js"
import { useViewData } from "../use-view-data.js"

import {
  AskAiButton,
  CountPill,
  DrillButton,
  FilterBar,
  GroupCard,
  OpenInCockpitLink,
  SectionHeading,
  TONE_DOT,
  WidgetShell,
  type FilterChip,
  type ToneVariant,
} from "@miragon-ai/widget-shell/widgets"

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
  engineId,
  onOpenDetail,
}: {
  process: DisplayProcess
  expanded: boolean
  engineId: string
  onOpenDetail: () => void
}) {
  const tone = process.tone
  const cockpitUrl = process.cockpitUrl

  return (
    <div
      className={`grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto] items-center gap-4 px-4 py-3 ${
        expanded ? "border-border border-b" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
          <span className={`size-1.5 rounded-full ${TONE_DOT[tone]}`} />
          <span className="truncate">
            {process.processDefinitionName ?? process.processDefinitionKey}
          </span>
          {process.version !== null && (
            <code className="text-muted-foreground font-mono text-xs font-normal">
              v{process.version}
            </code>
          )}
        </div>
        <div className="text-muted-foreground font-mono text-xs">
          {process.affectedActivityCount}{" "}
          {process.affectedActivityCount === 1 ? "activity" : "activities"} ·{" "}
          {process.runningInstances !== null
            ? `${process.runningInstances.toLocaleString()} instances`
            : "instances unknown"}{" "}
          · last {formatTimestamp(process.latestIncident)}
        </div>
      </div>
      <div className="text-muted-foreground text-right text-xs tabular-nums">
        <div className="text-foreground font-semibold">
          {process.affectedActivityCount}
          {process.totalActivityCount !== null && (
            <span className="text-muted-foreground font-normal">
              {" "}
              /{process.totalActivityCount}
            </span>
          )}
        </div>
        <div>activities</div>
      </div>
      <div className="text-muted-foreground text-right text-xs tabular-nums">
        <div className="text-foreground font-semibold">+{process.last24hCount}</div>
        <div>last 24h</div>
      </div>
      <CountPill tone={tone}>{process.incidentCount}</CountPill>
      <AskAiButton
        variant="subtle"
        label="Analyze"
        prompt={`Analyze the root cause of the ${process.incidentCount} open incident(s) on process ${process.processDefinitionName ?? process.processDefinitionKey} (key ${process.processDefinitionKey}, version v${process.version ?? "n/a"}) on engine ${engineId}. ${process.affectedActivityCount} activity/activities are affected, ${process.last24hCount} new in the last 24h, latest incident ${formatTimestamp(process.latestIncident)}, across roughly ${process.runningInstances ?? "unknown"} running instances. Use camunda7_list_incidents (filtered to processDefinitionKey ${process.processDefinitionKey}) and camunda7_query_historic_activity_instances to determine whether the failing activities share one root cause, classify the failure (transient/retryable vs. data/config vs. broken model), and recommend a fix — batch retry via camunda7_set_job_retries_batch, a variable correction, an instance modification via camunda7_modify_process_instance, or a model fix requiring redeploy/migration. Report findings and the recommended action; do not execute mutating changes without confirmation.`}
      />
      <DrillButton
        onDrill={onOpenDetail}
        ariaLabel={`Open incidents detail for ${process.processDefinitionName ?? process.processDefinitionKey}`}
      >
        Open detail
      </DrillButton>
      {cockpitUrl ? <OpenInCockpitLink url={cockpitUrl} /> : <span />}
      <span
        aria-hidden="true"
        className={`text-muted-foreground inline-block w-3 text-center text-xs transition-transform ${
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
    <div className="border-border text-foreground grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 border-b px-4 py-3 pl-7 last:border-b-0">
      <div className="bg-critical-soft text-critical grid size-[18px] place-items-center rounded-full text-[10px] font-bold">
        !
      </div>
      <div className="min-w-0">
        <div className="text-foreground truncate text-sm font-semibold">
          {activity.activityName ?? activity.activityId}
        </div>
        <div className="text-muted-foreground truncate font-mono text-xs">
          {activity.representativeMessage ?? activity.activityId}
        </div>
      </div>
      <div className="text-muted-foreground text-right font-mono text-[11px]">
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
  const [activeChip, setActiveChip] = useState<string>(TYPE_ALL)
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
          tone: severityTone(p.incidentCount),
        }
      })
      .filter((p): p is DisplayProcess => p !== null)
  }, [data, search, activeChip])

  if (!data) {
    if (error) {
      return (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )
    }
    return (
      <div className="text-muted-foreground p-2 text-sm">
        {loading ? "Loading…" : "No data available"}
      </div>
    )
  }

  const chips: FilterChip[] = [
    { id: TYPE_ALL, label: "All", count: data.totalCount, active: activeChip === TYPE_ALL },
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
    go({ type: "process-incidents", processDefinitionKey })
  }

  return (
    <>
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
          <div className="border-border text-muted-foreground bg-card rounded-lg border p-8 text-center text-sm">
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
