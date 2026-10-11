import { useState } from "react"
import {
  GroupCard,
  SectionHeading,
  TONE_DOT,
  ViewDataState,
  WidgetShell,
  formatNumber,
} from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "../../view-models.js"
import { useNav } from "../navigation.js"
import { ActivitySummary } from "./activity-summary.js"
import { useDefinitionData } from "./feed.js"
import { PagedIncidentTable } from "./incident-table.js"
import { EmptyStateWithSiblings } from "./empty-state.js"
import { useT } from "../../messages/use-t.js"

function NoIncidentsState({
  data,
  emptyVariant,
  onJumpTo,
}: {
  data: ProcessIncidentsData
  emptyVariant: "siblings" | "note"
  onJumpTo: (processDefinitionKey: string) => void
}) {
  const t = useT()
  const processName = data.processDefinitionName ?? data.processDefinitionKey
  if (emptyVariant === "siblings") {
    return (
      <EmptyStateWithSiblings
        processName={processName}
        siblings={data.siblingsWithIncidents}
        onJumpTo={onJumpTo}
      />
    )
  }
  return (
    <div className="border-border bg-card flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm">
      <span className={`size-1.5 rounded-full ${TONE_DOT.success}`} aria-hidden="true" />
      <span className="text-foreground">{t("procIncList.noIncidentsNote", { processName })}</span>
    </div>
  )
}

export function ActivityIncidentList({
  data: initialData = null,
  processDefinitionKey,
  engine,
  emptyVariant = "note",
}: {
  data?: ProcessIncidentsData | null
  processDefinitionKey?: string
  engine?: string
  /**
   * No-incidents rendering — the entry point's focus lever: the default
   * definition view shows a slim one-line success note; the incidents focus
   * keeps the explorative empty state that jumps to sibling processes with
   * open incidents.
   */
  emptyVariant?: "siblings" | "note"
}) {
  const t = useT()
  const go = useNav()
  const { data, loading, error, refetch } = useDefinitionData(
    initialData,
    processDefinitionKey,
    engine,
  )
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Mutations must target the exact engine this data was fetched from (the prop
  // in the cockpit, the server-resolved id standalone) — never fall back to the
  // caller's default engine, which can differ if the default-engine save raced or failed.
  const engineId = engine ?? data?.engineId

  if (!data) {
    return (
      <WidgetShell>
        <ViewDataState
          loading={loading}
          error={error}
          loadingText={t("procIncList.loading")}
          emptyText={t("procIncList.noData")}
          onRetry={refetch}
          retryLabel={t("viewState.retry")}
        />
      </WidgetShell>
    )
  }

  function jumpToProcess(processDefinitionKey: string) {
    go({ type: "process-incidents", processDefinitionKey })
  }

  function analyzeIncident(incidentId: string) {
    go({ type: "incident-detail", incidentId })
  }

  function toggleExpanded(activityId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(activityId)) next.delete(activityId)
      else next.add(activityId)
      return next
    })
  }

  const affectedActivityCount = data.activities.length

  return (
    <WidgetShell>
      <section>
        <SectionHeading
          title={t("procIncList.groupedHeading")}
          hint={t("procIncList.affectedHint", { count: formatNumber(affectedActivityCount) })}
        />
        {data.activities.length === 0 ? (
          <NoIncidentsState data={data} emptyVariant={emptyVariant} onJumpTo={jumpToProcess} />
        ) : (
          data.activities.map((activity) => (
            <GroupCard
              key={activity.activityId}
              expanded={expanded.has(activity.activityId)}
              onToggle={() => toggleExpanded(activity.activityId)}
              summary={
                <ActivitySummary activity={activity} expanded={expanded.has(activity.activityId)} />
              }
            >
              {/* Rows come from the paged per-activity feed (mounted on
                  expand), not the definition payload — the group reaches every
                  incident, not just the 200-row recency scan. The table owns
                  the rows' remedies, keyed on that feed. */}
              <PagedIncidentTable
                processDefinitionKey={data.processDefinitionKey}
                activityId={activity.activityId}
                engine={engineId}
                vendor={data.engineVendor}
                onAnalyze={analyzeIncident}
              />
            </GroupCard>
          ))
        )}
      </section>
    </WidgetShell>
  )
}
