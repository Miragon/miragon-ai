import { Fragment, useState } from "react"
import { Button } from "@miragon/mcp-toolkit-ui"
import {
  HandOffButton,
  DrillButton,
  ListTable,
  LogText,
  OpenInCockpitLink,
  StatusBadge,
  Td,
  ViewDataState,
  formatNumber,
  formatTimestamp,
  truncate,
  usePagedViewData,
  type ListTableColumn,
} from "@miragon-ai/widget-shell/widgets"

import type { ActivityIncidentsData, IncidentInstance } from "../../view-models.js"
import { CAMUNDA7_ACTIVITY_INCIDENTS_DATA } from "../../tool-names.js"
import { CockpitListFooter } from "../list-footer.js"
import { useHandOff, type HandOff } from "../lib/hand-off.js"
import { useT } from "../../messages/use-t.js"
import { EngineActionDialog } from "../lib/engine-action-dialog.js"
import { recoveryOf } from "../lib/incident-recovery.js"
import { useIncidentRecovery, type IncidentRecoveryState } from "./use-incident-recovery.js"

/** Page size — mirrors the feed's server default. */
const INCIDENT_PAGE_SIZE = 10

/** A ticket draft for ONE incident row — its message is engine text, quoted. */
export function draftIncidentTicketHandOff(
  incident: IncidentInstance,
  engine: string | undefined,
): HandOff {
  return {
    intent: "askAi.incident.draftTicket",
    ids: { engine, incidentId: incident.id },
    facts: { incidentType: incident.incidentType, processInstanceId: incident.processInstanceId },
    untrusted: [{ label: "incidentMessage", text: incident.incidentMessage }],
    tools: ["camunda7_format_incident_issue"],
  }
}

/** The row's Resolve/Retry button — absent when the toolset or incident type offers none. */
function RecoveryButton({
  incident,
  recovery,
}: {
  incident: IncidentInstance
  recovery: IncidentRecoveryState
}) {
  const t = useT()
  const action = recovery.actionFor(incident)
  if (!action) return null
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={recovery.isPending(incident)}
      title={action === "retry" ? t("procIncTable.retryHint") : undefined}
      onClick={() => recovery.act(incident)}
    >
      {action === "retry" ? t("procIncTable.retry") : t("procIncTable.resolve")}
    </Button>
  )
}

export function IncidentTable({
  incidents,
  recovery,
  onAnalyze,
  hideInstanceColumn = false,
  previewCount,
  engine,
  vendor,
}: {
  incidents: IncidentInstance[]
  /** Row actions + their optimistic state (`useIncidentRecovery`). */
  recovery: IncidentRecoveryState
  onAnalyze: (incidentId: string) => void
  /**
   * Drop the instance column (and the grouped view's icon-column indent) when
   * every row already belongs to one known instance — the instance-detail view.
   */
  hideInstanceColumn?: boolean
  /**
   * Client-side preview cap with a one-shot "show more" expander — for
   * embeddings whose rows are already fully present (instance detail).
   * Omitted → every handed-in row renders (the paged wrapper owns the cap).
   */
  previewCount?: number
  /** The engine the rows came from, pinned into the AI handoffs. */
  engine?: string
  /** The engine product (`engineVendor`) — names the per-row link into its web app. */
  vendor?: string
}) {
  const t = useT()
  const { ask } = useHandOff()
  const [showAll, setShowAll] = useState(false)
  const visible =
    previewCount === undefined || showAll ? incidents : incidents.slice(0, previewCount)
  const hidden = incidents.length - visible.length
  // pl-12 keeps the cells aligned under the activity summary's icon column in
  // the grouped (per-activity) rendering; standalone the indent would float.
  const leadPad = hideInstanceColumn ? undefined : "pl-12"
  const columnCount = hideInstanceColumn ? 3 : 4

  const columns: ListTableColumn[] = [
    ...(hideInstanceColumn
      ? []
      : [{ label: t("procIncTable.columnInstance"), className: leadPad }]),
    { label: t("procIncTable.columnErrorMessage") },
    { label: t("procIncTable.columnTime"), align: "right" as const },
    { label: t("procIncTable.columnActions") },
  ]

  return (
    <div className="bg-muted">
      <ListTable ariaLabel={t("procIncTable.tableLabel")} columns={columns}>
        {visible.map((incident) => {
          const done = recovery.isDone(incident)
          const error = recovery.errorOf(incident)
          const retried = recoveryOf(incident).action !== "resolve"
          const instanceUrl = incident.cockpitInstanceUrl
          return (
            <Fragment key={incident.id}>
              <tr className={done ? "opacity-50" : undefined}>
                {!hideInstanceColumn && (
                  <Td className={leadPad}>
                    <span className="text-m-blue font-mono text-xs font-medium">
                      {truncate(incident.processInstanceId, 12)}
                    </span>
                  </Td>
                )}
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge tone="danger">{incident.incidentType}</StatusBadge>
                    <LogText text={incident.incidentMessage} />
                  </div>
                </Td>
                <Td
                  align="right"
                  className="text-muted-foreground font-mono text-xs whitespace-nowrap"
                >
                  {formatTimestamp(incident.incidentTimestamp)}
                </Td>
                <Td>
                  {done ? (
                    <StatusBadge tone="neutral">
                      {retried ? t("procIncTable.retried") : t("procIncTable.resolved")}
                    </StatusBadge>
                  ) : (
                    <div className="flex items-center gap-1">
                      <DrillButton
                        onDrill={() => onAnalyze(incident.id)}
                        ariaLabel={t("procIncTable.openIncidentDetail")}
                      >
                        {t("procIncTable.open")}
                      </DrillButton>
                      <RecoveryButton incident={incident} recovery={recovery} />
                      {instanceUrl && <OpenInCockpitLink url={instanceUrl} vendor={vendor} />}
                      <HandOffButton
                        action="draftTicket"
                        variant="icon"
                        prompt={ask(draftIncidentTicketHandOff(incident, engine))}
                      />
                    </div>
                  )}
                </Td>
              </tr>
              {error && (
                <tr>
                  <td
                    colSpan={columnCount}
                    className={`border-border border-b px-4 py-1.5 ${leadPad ?? ""}`}
                  >
                    <span className="text-danger-ink text-xs">
                      {retried
                        ? t("procIncTable.retryError", { message: error })
                        : t("procIncTable.resolveError", { message: error })}
                    </span>
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </ListTable>
      {hidden > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAll(true)}
          className={`text-m-blue w-full justify-start ${leadPad ?? "pl-4"}`}
        >
          {t("procIncTable.showMore", { count: formatNumber(hidden) })}
        </Button>
      )}
    </div>
  )
}

/**
 * Self-fetching, offset-paged wrapper of {@link IncidentTable} for one
 * activity group of the definition view: pages `camunda7_activity_incidents_data`
 * (exact /incident/count total) with the house Load-more pattern, so a group
 * reaches every incident — not just the definition feed's 200-row scan window.
 * Mounts lazily: GroupCard renders children only while expanded.
 *
 * It owns its rows' remedies: their success marks reset on THIS feed's page 0
 * (a refetch of it drops the appended pages too), never on the definition
 * feed — which can answer the same write's invalidation first while these
 * rows are still the pre-write page, and would bring a cleared row's button
 * back.
 */
export function PagedIncidentTable({
  processDefinitionKey,
  activityId,
  engine,
  vendor,
  onAnalyze,
}: {
  processDefinitionKey: string
  activityId: string
  /** Explicit engine routing; omitted → the caller's saved default engine. */
  engine?: string
  /** The engine product of the definition view (`engineVendor`), for the rows' links. */
  vendor?: string
  onAnalyze: (incidentId: string) => void
}) {
  const t = useT()
  const args: Record<string, unknown> = { processDefinitionKey, activityId }
  if (engine) args.engine = engine
  const paged = usePagedViewData<IncidentInstance, ActivityIncidentsData>({
    initialData: null,
    key: ["camunda7:activity-incidents", engine ?? null, processDefinitionKey, activityId],
    tool: CAMUNDA7_ACTIVITY_INCIDENTS_DATA,
    args,
    pageSize: INCIDENT_PAGE_SIZE,
    ready: !!(processDefinitionKey && activityId),
    selectItems: (d) => d.incidents,
    selectTotal: (d) => d.totalCount,
  })
  const recovery = useIncidentRecovery(engine, { resetOn: paged.firstPage })

  if (!paged.firstPage) {
    return (
      <div className="bg-muted px-4 py-3">
        <ViewDataState
          loading={paged.loading}
          error={paged.error}
          loadingText={t("procIncTable.loading")}
          emptyText={t("procIncTable.noIncidents")}
        />
      </div>
    )
  }

  return (
    <>
      {paged.items.length === 0 ? (
        <p className="bg-muted text-muted-foreground px-4 py-3 text-sm">
          {t("procIncTable.noIncidents")}
        </p>
      ) : (
        <IncidentTable
          incidents={paged.items}
          recovery={recovery}
          onAnalyze={onAnalyze}
          engine={engine}
          vendor={vendor}
        />
      )}
      <div className="bg-muted px-3 pb-1">
        <CockpitListFooter paged={paged} noun={t("procIncTable.footerNoun")} />
      </div>
      {/* The per-row button only requests the resolve; the actual
          camunda7_resolve_incident call runs after this confirmation. The
          dialog stays open until success so a failure is shown right here
          (and inline at the row once dismissed). */}
      <EngineActionDialog action={recovery.resolve} />
    </>
  )
}
