import { useEffect, useState } from "react"
import { useToolMutation } from "@miragon/mcp-toolkit-ui"
import {
  GroupCard,
  SectionHeading,
  TONE_DOT,
  ViewDataState,
  WidgetShell,
} from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "../../view-models.js"
import { useNav } from "../navigation.js"
import { CAMUNDA7_PROCESS_INCIDENTS_DATA } from "../../tool-names.js"
import { useViewData } from "../use-view-data.js"
import { refreshCockpitData } from "../refresh.js"
import { ConfirmDialog } from "../confirm-dialog.js"
import { ActivitySummary } from "./activity-summary.js"
import { IncidentTable, type ResolveError } from "./incident-table.js"
import { EmptyStateWithSiblings } from "./empty-state.js"
import { useT } from "../../messages/use-t.js"

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
  const resolveMutation = useToolMutation("camunda7_resolve_incident")
  const go = useNav()
  const { data, loading, error } = useViewData<ProcessIncidentsData>(
    initialData,
    ["camunda7:process-incidents", engine ?? null, processDefinitionKey ?? null],
    CAMUNDA7_PROCESS_INCIDENTS_DATA,
    { processDefinitionKey, engine },
    !!processDefinitionKey,
  )
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [resolveError, setResolveError] = useState<ResolveError | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [confirmResolveId, setConfirmResolveId] = useState<string | null>(null)

  // The optimistic grey-out only bridges until the feed refetches — fresh data
  // is server truth, so stale "resolved" marks must not survive it.
  useEffect(() => {
    setResolvedIds(new Set())
  }, [data])

  if (!data) {
    return (
      <WidgetShell>
        <ViewDataState
          loading={loading}
          error={error}
          loadingText={t("procIncList.loading")}
          emptyText={t("procIncList.noData")}
        />
      </WidgetShell>
    )
  }

  // Mutations must target the exact engine this data was fetched from (the prop
  // in the cockpit, the server-resolved id standalone) — never fall back to the
  // session default, which can differ if the sticky select raced or failed.
  const engineId = engine ?? data.engineId

  function jumpToProcess(processDefinitionKey: string) {
    go({ type: "process-incidents", processDefinitionKey })
  }

  function analyzeIncident(incidentId: string) {
    go({ type: "incident-detail", incidentId })
  }

  function handleResolve(incidentId: string) {
    setResolveError(null)
    setPendingIds((prev) => new Set(prev).add(incidentId))
    resolveMutation.mutate(
      { incidentId, engine: engineId },
      {
        onSuccess: () => {
          setResolvedIds((prev) => new Set(prev).add(incidentId))
          setConfirmResolveId(null)
          // Sibling widgets (KPI, header, BPMN flow) share the feed key —
          // refetch so their counts reflect the resolution.
          refreshCockpitData()
        },
        onError: (err) => setResolveError({ incidentId, message: err.message }),
        onSettled: () =>
          setPendingIds((prev) => {
            const next = new Set(prev)
            next.delete(incidentId)
            return next
          }),
      },
    )
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
          hint={
            affectedActivityCount === 1
              ? t("procIncList.affectedHintOne", { count: affectedActivityCount })
              : t("procIncList.affectedHintOther", { count: affectedActivityCount })
          }
        />
        {data.activities.length === 0 ? (
          emptyVariant === "siblings" ? (
            <EmptyStateWithSiblings
              processName={data.processDefinitionName ?? data.processDefinitionKey}
              siblings={data.siblingsWithIncidents}
              onJumpTo={jumpToProcess}
            />
          ) : (
            <div className="border-border bg-card flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm">
              <span className={`size-1.5 rounded-full ${TONE_DOT.success}`} aria-hidden="true" />
              <span className="text-foreground">
                {t("procIncList.noIncidentsNote", {
                  processName: data.processDefinitionName ?? data.processDefinitionKey,
                })}
              </span>
            </div>
          )
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
              <IncidentTable
                incidents={activity.incidents}
                resolvedIds={resolvedIds}
                pendingIds={pendingIds}
                resolveError={resolveError}
                onResolve={setConfirmResolveId}
                onAnalyze={analyzeIncident}
              />
            </GroupCard>
          ))
        )}
      </section>

      {/* The per-row button only requests the resolve; the actual
          camunda7_resolve_incident call runs after this confirmation. The
          dialog stays open until success so a failure is shown right here
          (and inline at the row once dismissed). */}
      <ConfirmDialog
        open={confirmResolveId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmResolveId(null)
        }}
        title={t("procIncTable.confirmResolveTitle")}
        description={t("procIncTable.confirmResolveDescription")}
        confirmLabel={t("procIncTable.resolve")}
        cancelLabel={t("confirmDialog.cancel")}
        pendingLabel={t("confirmDialog.working")}
        pending={confirmResolveId !== null && pendingIds.has(confirmResolveId)}
        error={
          confirmResolveId !== null && resolveError?.incidentId === confirmResolveId
            ? resolveError.message
            : null
        }
        onConfirm={() => {
          if (confirmResolveId) handleResolve(confirmResolveId)
        }}
      />
    </WidgetShell>
  )
}
