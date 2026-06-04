import { useMemo, useState } from "react"
import {
  Card,
  CardContent,
  Badge,
  Alert,
  AlertDescription,
  Button,
  useToolMutation,
  useToolQuery,
} from "@miragon/mcp-toolkit-ui"
import { ModelContext } from "mcp-use/react"
import { useHostActions, type HostActions } from "@miragon-ai/widget-shell/widgets"

import type { InstanceDetailData, OpenUserTask } from "@miragon-ai/client-cibseven"
import { BpmnDiagram, type BpmnHighlight } from "./bpmn-diagram.js"
import { ActivityNode, Section, VariablesTable } from "./instance-sections.js"
import { TaskCompleteForm } from "./task-complete-form.js"
import { ConfirmDialog } from "./confirm-dialog.js"
import { refreshCockpitData } from "./refresh.js"
import { HistoryTimelineView, type HistoryActivity } from "./history-timeline.js"

export type { InstanceDetailData }

function OpenTaskCard({
  task,
  expanded,
  onToggle,
  onCompleted,
}: {
  task: OpenUserTask
  expanded: boolean
  onToggle: () => void
  onCompleted: () => void
}) {
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <div className="font-medium">{task.name ?? task.taskDefinitionKey}</div>
            <div className="text-muted-foreground font-mono text-xs">
              {task.taskDefinitionKey}
              {task.assignee && <> · assignee: {task.assignee}</>}
              {!task.assignee && <> · unassigned</>}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onToggle}>
            {expanded ? "Cancel" : "Complete"}
          </Button>
        </div>
        {expanded && (
          <div className="mt-3 border-t pt-3">
            <TaskCompleteForm
              taskId={task.id}
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
 * The activity audit log is the heaviest query on this view, so it loads lazily:
 * the wrapping <Section> mounts this component only when the operator expands it.
 * Relies on the session's sticky engine (like the instance mutations above).
 */
function InstanceAuditContent({ processInstanceId }: { processInstanceId: string }) {
  const q = useToolQuery<HistoryActivity[]>(
    ["camunda7:instance-history", processInstanceId],
    "camunda7_query_historic_activity_instances",
    { processInstanceId, sortBy: "startTime", sortOrder: "asc", maxResults: 500 },
  )
  if (q.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{q.error?.message ?? "Failed to load the audit log."}</AlertDescription>
      </Alert>
    )
  }
  if (!q.data) {
    return <p className="text-muted-foreground text-sm">Loading audit log…</p>
  }
  return <HistoryTimelineView activities={q.data} />
}

export function InstanceDetailWidget({ data }: { data: InstanceDetailData | null }) {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set())
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set())
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  // null = follow server state; true/false = local override after a suspend/activate.
  const [suspendedOverride, setSuspendedOverride] = useState<boolean | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)
  const host: HostActions = useHostActions()
  const resolveMutation = useToolMutation("camunda7_resolve_incident")
  const suspendMutation = useToolMutation("camunda7_suspend_process_instance")
  const activateMutation = useToolMutation("camunda7_activate_process_instance")
  const cancelMutation = useToolMutation("camunda7_delete_process_instance")

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

  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert>
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  const { instance, activityTree, variables, incidents, bpmnXml } = data
  const isSuspended = suspendedOverride ?? instance.suspended ?? false
  const isActionable = !instance.ended && !cancelled
  const isMutatingInstance =
    suspendMutation.isPending || activateMutation.isPending || cancelMutation.isPending

  function handleResolve(incidentId: string) {
    resolveMutation.mutate(
      { incidentId },
      {
        onSuccess: () => {
          setResolvedIds((prev) => new Set(prev).add(incidentId))
          refreshCockpitData()
        },
      },
    )
  }

  function handleSuspendToggle() {
    const mutation = isSuspended ? activateMutation : suspendMutation
    mutation.mutate(
      { processInstanceId: instance.id },
      {
        onSuccess: () => {
          setSuspendedOverride(!isSuspended)
          refreshCockpitData()
        },
      },
    )
  }

  function handleCancel() {
    cancelMutation.mutate(
      { processInstanceId: instance.id },
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

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-5 p-6">
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
          `Act via camunda7_resolve_incident / camunda7_set_job_retries / camunda7_suspend_process_instance / camunda7_delete_process_instance / camunda7_modify_process_instance. For root cause, compare with other instances via camunda7_list_incidents + camunda7_query_historic_activity_instances.`,
        ].join(" ")}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Process Instance Detail</h2>
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span>
              ID: <code className="font-mono">{instance.id}</code>
            </span>
            {instance.businessKey && (
              <span>
                Business Key: <code className="font-mono">{instance.businessKey}</code>
              </span>
            )}
            <Badge variant={cancelled || instance.ended ? "secondary" : "default"}>
              {cancelled ? "Cancelled" : instance.ended ? "Ended" : "Running"}
            </Badge>
            {!cancelled && isSuspended && <Badge variant="secondary">Suspended</Badge>}
          </div>
          <div className="text-muted-foreground mt-1 font-mono text-xs">
            Definition: {instance.definitionId}
          </div>
        </div>
        {isActionable && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isMutatingInstance}
              onClick={handleSuspendToggle}
            >
              {isSuspended ? "Activate" : "Suspend"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={isMutatingInstance}
              onClick={() => setConfirmCancel(true)}
            >
              Cancel instance
            </Button>
          </div>
        )}
      </div>

      {incidents && incidents.length > 0 && (
        <Section title="Incidents" count={activeIncidents.length} defaultOpen>
          <div className="flex flex-col gap-2">
            {incidents.map((inc) => {
              const resolved = resolvedIds.has(inc.id)
              return (
                <Card
                  key={inc.id}
                  className={`border-destructive/30 gap-0 py-0 shadow-none ${resolved ? "opacity-50" : ""}`}
                >
                  <CardContent className="p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={resolved ? "secondary" : "destructive"}>
                          {resolved ? "Resolved" : inc.incidentType}
                        </Badge>
                        <span className="text-muted-foreground text-xs">
                          {new Date(inc.incidentTimestamp).toLocaleString()}
                        </span>
                      </div>
                      {!resolved && (
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              host.askAi(
                                `Analyze the root cause of incident ${inc.id} (${inc.incidentType}${
                                  inc.incidentMessage ? `: ${inc.incidentMessage}` : ""
                                }) on process instance ${instance.id}${
                                  instance.businessKey ? ` / ${instance.businessKey}` : ""
                                } of ${instance.definitionId}. Check whether other instances fail the same way and recommend a fix (retry, variable change, or modification).`,
                              )
                            }
                          >
                            <span aria-hidden>✦</span> Analyze
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={resolveMutation.isPending}
                            onClick={() => handleResolve(inc.id)}
                          >
                            Resolve
                          </Button>
                        </div>
                      )}
                    </div>
                    {inc.incidentMessage && (
                      <p className="text-muted-foreground break-words font-mono text-sm">
                        {inc.incidentMessage}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </Section>
      )}

      {bpmnXml && (
        <Section title="Process Diagram" defaultOpen>
          <BpmnDiagram bpmnXml={bpmnXml} height={420} highlights={highlights} />
        </Section>
      )}

      {(visibleTasks.length > 0 || (data.openTasks ?? []).length > 0) && (
        <Section
          title="Open User Tasks"
          count={visibleTasks.length}
          defaultOpen={visibleTasks.length > 0}
        >
          {visibleTasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">All tasks completed.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {visibleTasks.map((task) => (
                <OpenTaskCard
                  key={task.id}
                  task={task}
                  expanded={activeTaskId === task.id}
                  onToggle={() => setActiveTaskId(activeTaskId === task.id ? null : task.id)}
                  onCompleted={() => {
                    setCompletedTaskIds((prev) => new Set(prev).add(task.id))
                    setActiveTaskId(null)
                  }}
                />
              ))}
            </div>
          )}
        </Section>
      )}

      {activityTree && (
        <Section title="Activity Tree" defaultOpen>
          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="p-3">
              <ActivityNode node={activityTree} />
            </CardContent>
          </Card>
        </Section>
      )}

      <Section title="Variables" count={variableEntries.length} defaultOpen>
        <VariablesTable
          variables={variables}
          instanceId={instance.id}
          readOnly={instance.ended || cancelled}
        />
      </Section>

      <Section title="Audit log" onToggle={setAuditOpen}>
        {auditOpen ? (
          <InstanceAuditContent processInstanceId={instance.id} />
        ) : (
          <p className="text-muted-foreground text-sm">Expand to load the activity history.</p>
        )}
      </Section>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this process instance?"
        description="This deletes the running instance and all of its tokens. This action is irreversible."
        confirmLabel="Cancel instance"
        destructive
        pending={cancelMutation.isPending}
        onConfirm={handleCancel}
      />
    </div>
  )
}
