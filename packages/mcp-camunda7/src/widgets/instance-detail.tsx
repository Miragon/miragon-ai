import { useEffect, useMemo, useState } from "react"
import {
  Card,
  CardContent,
  Alert,
  AlertDescription,
  Button,
  useToolMutation,
  useToolQuery,
} from "@miragon/mcp-toolkit-ui"
import { ModelContext } from "mcp-use/react"
import {
  AskAiButton,
  KpiGrid,
  Section,
  SectionHeading,
  StatusBadge,
  WidgetHeader,
  useDetailView,
} from "@miragon-ai/widget-shell/widgets"

import type { InstanceDetailData, OpenUserTask } from "../view-models.js"
import { CAMUNDA7_INSTANCE_DETAIL_DATA } from "../tool-names.js"
import { BpmnDiagram, type BpmnHighlight } from "./bpmn-diagram.js"
import { ActivityNode, VariablesTable } from "./instance-sections.js"
import { IncidentTable, type ResolveError } from "./process-incidents/incident-table.js"
import { TaskCompleteForm } from "./task-complete-form.js"
import { ConfirmDialog } from "./confirm-dialog.js"
import { DetailPage, type DetailPageTab } from "./detail-page.js"
import { refreshCockpitData } from "./refresh.js"
import { useNav } from "./navigation.js"
import { HistoryTimelineView, type HistoryActivity } from "./history-timeline.js"
import { useT } from "../messages/use-t.js"

export type { InstanceDetailData }

function OpenTaskCard({
  task,
  engine,
  expanded,
  onToggle,
  onCompleted,
}: {
  task: OpenUserTask
  engine?: string
  expanded: boolean
  onToggle: () => void
  onCompleted: () => void
}) {
  const t = useT()
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <div className="font-medium">{task.name ?? task.taskDefinitionKey}</div>
            <div className="text-muted-foreground font-mono text-xs">
              {task.taskDefinitionKey}
              {task.assignee && <> · {t("instanceDetail.assignee", { name: task.assignee })}</>}
              {!task.assignee && <> · {t("instanceDetail.unassigned")}</>}
            </div>
          </div>
          <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={onToggle}>
            {expanded ? t("instanceDetail.close") : t("instanceDetail.complete")}
          </Button>
        </div>
        {expanded && (
          <div className="mt-3 border-t pt-3">
            <TaskCompleteForm
              taskId={task.id}
              engine={engine}
              formSchema={task.formSchema}
              onCompleted={onCompleted}
              onCancel={onToggle}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The activity audit log is the heaviest query on this view, so it loads
 * lazily: the History tab mounts this component only on first activation
 * (inactive tab panels stay unmounted — see {@link DetailPage}).
 * Relies on the session's sticky engine (like the instance mutations above).
 * The query tool returns a pagination envelope — the timeline renders the page.
 */
function InstanceAuditContent({ processInstanceId }: { processInstanceId: string }) {
  const t = useT()
  const q = useToolQuery<{ items: HistoryActivity[] }>(
    ["camunda7:instance-history", processInstanceId],
    "camunda7_query_historic_activity_instances",
    { processInstanceId, sortBy: "startTime", sortOrder: "asc", maxResults: 500 },
  )
  if (q.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {q.error?.message ?? t("instanceDetail.auditLoadError")}
        </AlertDescription>
      </Alert>
    )
  }
  if (!q.data) {
    return <p className="text-muted-foreground text-sm">{t("instanceDetail.auditLoading")}</p>
  }
  return <HistoryTimelineView activities={q.data.items ?? []} />
}

export function InstanceDetailWidget({
  data: initialData = null,
  processInstanceId,
  engine,
}: {
  data?: InstanceDetailData | null
  processInstanceId?: string
  engine?: string
}) {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [resolveError, setResolveError] = useState<ResolveError | null>(null)
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set())
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  // null = follow server state; true/false = local override after a suspend/activate.
  const [suspendedOverride, setSuspendedOverride] = useState<boolean | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmSuspension, setConfirmSuspension] = useState(false)
  const [confirmResolveId, setConfirmResolveId] = useState<string | null>(null)
  const t = useT()
  const go = useNav()
  const resolveMutation = useToolMutation("camunda7_resolve_incident")
  const suspensionMutation = useToolMutation("camunda7_set_process_instance_suspension")
  const cancelMutation = useToolMutation("camunda7_delete_process_instance")
  const { data, guard } = useDetailView<InstanceDetailData>({
    initialData,
    key: ["camunda7:instance-detail", engine ?? null, processInstanceId ?? null],
    tool: CAMUNDA7_INSTANCE_DETAIL_DATA,
    args: { processInstanceId, engine },
    ready: !!processInstanceId,
    loadingText: t("instanceDetail.loading"),
    emptyText: t("instanceDetail.noData"),
  })
  // The suspend/activate override only bridges the gap until the feed
  // refetches — fresh server data must win again.
  useEffect(() => setSuspendedOverride(null), [data])
  // Same rule for the optimistic resolved marks (mirrors process-incidents/list).
  useEffect(() => setResolvedIds(new Set()), [data])

  const visibleTasks = useMemo<OpenUserTask[]>(
    () => (data?.openTasks ?? []).filter((task) => !completedTaskIds.has(task.id)),
    [data?.openTasks, completedTaskIds],
  )

  const highlights = useMemo<BpmnHighlight[]>(
    () => [
      { kind: "active", activityIds: data?.activeActivityIds ?? [] },
      { kind: "incident", activityIds: data?.incidentActivityIds ?? [] },
      {
        kind: "open-task",
        activityIds: visibleTasks.map((task) => task.taskDefinitionKey),
      },
    ],
    [data?.activeActivityIds, data?.incidentActivityIds, visibleTasks],
  )

  if (!data) return guard

  const { instance, activityTree, variables, incidents, bpmnXml } = data
  const isSuspended = suspendedOverride ?? instance.suspended ?? false
  const isActionable = !instance.ended && !cancelled
  const isMutatingInstance = suspensionMutation.isPending || cancelMutation.isPending
  // Standalone (camunda7_show_instance_detail) the `engine` prop is undefined; fall
  // back to the engine the data was fetched against — mutations (and the AI
  // prompts) must target the exact engine this data came from, never the session
  // default, which can differ if the sticky select raced or failed.
  const engineId = engine ?? data.engineId

  function handleResolve(incidentId: string) {
    setResolveError(null)
    setPendingIds((prev) => new Set(prev).add(incidentId))
    resolveMutation.mutate(
      { incidentId, engine: engineId },
      {
        onSuccess: () => {
          setResolvedIds((prev) => new Set(prev).add(incidentId))
          setConfirmResolveId(null)
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

  function handleSuspendToggle() {
    suspensionMutation.mutate(
      { processInstanceId: instance.id, suspended: !isSuspended, engine: engineId },
      {
        onSuccess: () => {
          setSuspendedOverride(!isSuspended)
          setConfirmSuspension(false)
          refreshCockpitData()
        },
      },
    )
  }

  function handleCancel() {
    cancelMutation.mutate(
      { processInstanceId: instance.id, engine: engineId },
      {
        onSuccess: () => {
          setCancelled(true)
          setConfirmCancel(false)
          refreshCockpitData()
        },
      },
    )
  }

  const variableEntries = Object.entries(variables)
  const activeIncidents = (incidents ?? []).filter((i) => !resolvedIds.has(i.id))
  const activeActivityIds = (data.activeActivityIds ?? []).join(", ") || "none"
  const incidentActivityIds = (data.incidentActivityIds ?? []).join(", ") || "none"
  // When neither the prop nor the fetched id is known the prompts omit the engine
  // clause entirely (the sticky session engine applies) — never inline a
  // placeholder as if it were an engine id.
  const engineClause = engineId ? `, engine ${engineId}` : ""

  const statusLabel = cancelled
    ? t("instanceDetail.statusCancelled")
    : instance.ended
      ? t("instanceDetail.statusEnded")
      : isSuspended
        ? t("instanceDetail.statusSuspended")
        : t("instanceDetail.statusRunning")
  const statusTone =
    cancelled || instance.ended ? ("neutral" as const) : isSuspended ? "warning" : "success"

  const tabs: DetailPageTab[] = [
    {
      id: "tasks",
      label: t("instanceDetail.tabTasks"),
      count: visibleTasks.length,
      // In-progress task-form input must survive a tab switch.
      keepMounted: true,
      content:
        visibleTasks.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {(data.openTasks ?? []).length > 0
              ? t("instanceDetail.tasksAllCompleted")
              : t("instanceDetail.noOpenTasks")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleTasks.map((task) => (
              <OpenTaskCard
                key={task.id}
                task={task}
                engine={engineId}
                expanded={activeTaskId === task.id}
                onToggle={() => setActiveTaskId(activeTaskId === task.id ? null : task.id)}
                onCompleted={() => {
                  setCompletedTaskIds((prev) => new Set(prev).add(task.id))
                  setActiveTaskId(null)
                }}
              />
            ))}
          </div>
        ),
    },
    {
      id: "incidents",
      label: t("instanceDetail.tabIncidents"),
      count: activeIncidents.length,
      content:
        (incidents ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("instanceDetail.noIncidents")}</p>
        ) : (
          /* Same IncidentTable as the definition view — an incident looks
              identical on both pages. All rows belong to this instance, so
              the instance column is dropped. */
          <IncidentTable
            incidents={incidents ?? []}
            resolvedIds={resolvedIds}
            pendingIds={pendingIds}
            resolveError={resolveError}
            onResolve={setConfirmResolveId}
            onAnalyze={(incidentId) => go({ type: "incident-detail", incidentId })}
            hideInstanceColumn
          />
        ),
    },
    {
      id: "variables",
      label: t("instanceDetail.tabVariables"),
      count: variableEntries.length,
      // An open variable-edit row must survive a tab switch.
      keepMounted: true,
      content: (
        <>
          <div className="mb-2">
            <AskAiButton
              variant="subtle"
              label={t("instanceDetail.explainVariables")}
              prompt={`Explain and sanity-check the variables of CIB Seven process instance ${instance.id} (definition ${instance.definitionId}${engineClause}). Use camunda7_get_process_instance_variables(processInstanceId: "${instance.id}") for the authoritative values. For each meaningful variable say what it represents, and flag any value that looks missing, malformed, or inconsistent and could explain the current incident(s). If you find a likely-bad variable, propose the corrected value — but do not set it without my confirmation.`}
            />
          </div>
          <VariablesTable
            variables={variables}
            instanceId={instance.id}
            engine={engineId}
            readOnly={instance.ended || cancelled}
          />
        </>
      ),
    },
    {
      id: "history",
      label: t("instanceDetail.tabHistory"),
      content: (
        <>
          <div className="mb-2">
            <AskAiButton
              variant="subtle"
              label={t("instanceDetail.explainTimeline")}
              prompt={`Explain the execution timeline of CIB Seven process instance ${instance.id} (definition ${instance.definitionId}${engineClause}). Use camunda7_query_historic_activity_instances(processInstanceId: "${instance.id}") to walk the per-activity history in order: where did the token spend the most time, which step is it currently stuck at, and does the path taken match the expected happy path? Call out the single biggest delay and whether it indicates a problem. Explanation only — do not change anything.`}
            />
          </div>
          {/* Mounted on first tab activation — the lazy-load point. */}
          <InstanceAuditContent processInstanceId={instance.id} />
        </>
      ),
    },
  ]

  const defaultTab =
    visibleTasks.length > 0 ? "tasks" : activeIncidents.length > 0 ? "incidents" : "variables"

  return (
    <DetailPage
      header={
        <WidgetHeader
          size="detail"
          badge={<StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>}
          title={t("instanceDetail.title")}
          sub={
            <>
              <span>
                {t("instanceDetail.idLabel")} <code className="font-mono">{instance.id}</code>
              </span>
              {instance.businessKey && (
                <span>
                  {t("instanceDetail.businessKeyLabel")}{" "}
                  <code className="font-mono">{instance.businessKey}</code>
                </span>
              )}
              <span className="font-mono text-xs">
                {t("instanceDetail.definitionLabel", { id: instance.definitionId })}
              </span>
            </>
          }
          actions={
            <>
              <AskAiButton
                variant="primary"
                prompt={`Diagnose CIB Seven process instance ${instance.id}${
                  instance.businessKey ? ` (business key ${instance.businessKey})` : ""
                } of definition ${instance.definitionId}${engineClause}. It is currently at activities ${activeActivityIds} with incidents at ${incidentActivityIds}. Use camunda7_get_process_instance, camunda7_list_incidents({processInstanceId: "${instance.id}"}), camunda7_get_activity_instance_tree and camunda7_get_process_instance_variables to establish: (1) why the token is stuck where it is, (2) the root cause of each open incident, (3) whether the same failure is hitting other live instances of ${instance.definitionId} (cross-check via camunda7_list_incidents at the definition level). Then recommend the single best remediation — resolve incident, camunda7_set_job_retries, camunda7_set_process_instance_variable, or camunda7_modify_process_instance — and state the exact arguments you would call it with. Do not execute mutations; present the plan for my approval.`}
              />
              {isActionable && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isMutatingInstance}
                    onClick={() => {
                      suspensionMutation.reset()
                      setConfirmSuspension(true)
                    }}
                  >
                    {isSuspended ? t("instanceDetail.activate") : t("instanceDetail.suspend")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={isMutatingInstance}
                    onClick={() => {
                      cancelMutation.reset()
                      setConfirmCancel(true)
                    }}
                  >
                    {t("instanceDetail.cancelInstance")}
                  </Button>
                </>
              )}
            </>
          }
        />
      }
      kpi={
        <KpiGrid
          boxed
          cells={[
            {
              label: t("instanceDetail.kpiState"),
              value: statusLabel,
              tone: statusTone,
            },
            {
              label: t("instanceDetail.kpiOpenTasks"),
              value: visibleTasks.length,
            },
            {
              label: t("instanceDetail.kpiOpenIncidents"),
              value: activeIncidents.length,
              tone: activeIncidents.length > 0 ? "critical" : undefined,
            },
            {
              label: t("instanceDetail.kpiVariables"),
              value: variableEntries.length,
            },
          ]}
        />
      }
      diagram={
        bpmnXml || activityTree ? (
          <section>
            {bpmnXml && (
              <>
                <SectionHeading title={t("instanceDetail.sectionDiagram")} />
                <BpmnDiagram bpmnXml={bpmnXml} height={420} highlights={highlights} />
              </>
            )}
            {/* Textual token view next to the diagram — shows multi-instance
                nesting the diagram overlay can't, collapsed by default. */}
            {activityTree && (
              <Section title={t("instanceDetail.sectionActivityTree")}>
                <ActivityNode node={activityTree} />
              </Section>
            )}
          </section>
        ) : undefined
      }
      tabs={tabs}
      defaultTab={defaultTab}
    >
      {/* Keep the agent aware of what the operator is looking at, so "Analyze"
          and any follow-up question resolve against this instance for free. */}
      <ModelContext
        content={[
          `Support is viewing CIB Seven process instance ${instance.id}${
            instance.businessKey ? ` (business key ${instance.businessKey})` : ""
          }, definition ${instance.definitionId}.`,
          `Status: ${
            cancelled
              ? "cancelled"
              : instance.ended
                ? "ended"
                : isSuspended
                  ? "suspended"
                  : "running"
          }; ${activeIncidents.length} open incident${activeIncidents.length === 1 ? "" : "s"}.`,
          `Act via camunda7_resolve_incident / camunda7_set_job_retries / camunda7_set_process_instance_suspension / camunda7_delete_process_instance / camunda7_modify_process_instance. For root cause, compare with other instances via camunda7_list_incidents + camunda7_query_historic_activity_instances.`,
        ].join(" ")}
      />

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t("instanceDetail.confirmCancelTitle")}
        description={t("instanceDetail.confirmCancelDescription")}
        confirmLabel={t("instanceDetail.cancelInstance")}
        cancelLabel={t("confirmDialog.cancel")}
        pendingLabel={t("confirmDialog.working")}
        destructive
        pending={cancelMutation.isPending}
        error={cancelMutation.error?.message ?? null}
        onConfirm={handleCancel}
      />

      <ConfirmDialog
        open={confirmSuspension}
        onOpenChange={setConfirmSuspension}
        title={
          isSuspended
            ? t("instanceDetail.confirmActivateTitle")
            : t("instanceDetail.confirmSuspendTitle")
        }
        description={
          isSuspended
            ? t("instanceDetail.confirmActivateDescription")
            : t("instanceDetail.confirmSuspendDescription")
        }
        confirmLabel={isSuspended ? t("instanceDetail.activate") : t("instanceDetail.suspend")}
        cancelLabel={t("confirmDialog.cancel")}
        pendingLabel={t("confirmDialog.working")}
        pending={suspensionMutation.isPending}
        error={suspensionMutation.error?.message ?? null}
        onConfirm={handleSuspendToggle}
      />

      <ConfirmDialog
        open={confirmResolveId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmResolveId(null)
        }}
        title={t("instanceDetail.confirmResolveTitle")}
        description={t("instanceDetail.confirmResolveDescription")}
        confirmLabel={t("instanceDetail.resolve")}
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
    </DetailPage>
  )
}
