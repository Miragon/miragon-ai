import type { InstanceDetailData } from "../../view-models.js"
import { useT, type T } from "../../messages/use-t.js"
import { useEngineAction, type ActionConfirmation, type TargetLine } from "../lib/engine-action.js"
import { useIncidentRecovery } from "../process-incidents/use-incident-recovery.js"

interface SuspensionArgs extends Record<string, unknown> {
  processInstanceId: string
  suspended: boolean
  engine?: string
}

interface CancelArgs extends Record<string, unknown> {
  processInstanceId: string
  engine?: string
}

/** The instance as a confirmation names it: id, business key, definition, engine. */
function instanceLines(
  t: T,
  instance: InstanceDetailData["instance"],
  engineId: string | undefined,
): [TargetLine, ...TargetLine[]] {
  const lines: [TargetLine, ...TargetLine[]] = [[t("confirmDialog.instance"), instance.id]]
  if (instance.businessKey) lines.push([t("confirmDialog.businessKey"), instance.businessKey])
  lines.push([t("confirmDialog.definition"), instance.definitionId])
  if (engineId) lines.push([t("confirmDialog.engine"), engineId])
  return lines
}

function cancelConfirmation(
  t: T,
  instance: InstanceDetailData["instance"],
  engineId: string | undefined,
): ActionConfirmation {
  return {
    title: t("instanceDetail.confirmCancelTitle"),
    description: t("instanceDetail.confirmCancelDescription"),
    target: instanceLines(t, instance, engineId),
    confirmLabel: t("instanceDetail.cancelInstance"),
    keepLabel: t("instanceDetail.keepInstance"),
    destructive: true,
  }
}

function suspensionConfirmation(
  t: T,
  suspend: boolean,
  instance: InstanceDetailData["instance"],
  engineId: string | undefined,
): ActionConfirmation {
  const target = instanceLines(t, instance, engineId)
  return suspend
    ? {
        title: t("instanceDetail.confirmSuspendTitle"),
        description: t("instanceDetail.confirmSuspendDescription"),
        target,
        confirmLabel: t("instanceDetail.confirmSuspend"),
        keepLabel: t("instanceDetail.keepRunning"),
      }
    : {
        title: t("instanceDetail.confirmActivateTitle"),
        description: t("instanceDetail.confirmActivateDescription"),
        target,
        confirmLabel: t("instanceDetail.confirmActivate"),
        keepLabel: t("instanceDetail.keepSuspended"),
      }
}

/**
 * The instance-level writes of the instance-detail view — suspend/activate
 * and cancel, each an `EngineAction` that asks first (naming the instance)
 * — plus the incident row remedies (`useIncidentRecovery`). The UI faces are
 * `InstanceHeader` (the buttons, only where `can*` allows them) and
 * `InstanceActionDialogs` (the confirmations).
 *
 * Every write is offered for the CURRENT state only (`isActionable`): never
 * on an ended or cancelled instance, and not while a failed refetch leaves
 * the state `unconfirmed` (completing the last task ends the instance — its
 * runtime read is a 404 then). The task completion additionally needs a
 * running, not suspended instance (`canCompleteTasks`).
 */
export function useInstanceActions({
  engine,
  data,
  unconfirmed,
}: {
  engine?: string
  data: InstanceDetailData | null
  /** A refetch failed over the shown data — the view cannot confirm the state. */
  unconfirmed: boolean
}) {
  const t = useT()
  const instanceId = data?.instance.id ?? ""
  // The instance still exists as far as the view can tell.
  const current = !!data && !data.instance.ended && !unconfirmed
  // No reset: a cancelled instance stays cancelled — its view is not
  // refetched after the write (the runtime read could only answer 404).
  const cancel = useEngineAction<CancelArgs>({
    tool: "camunda7_delete_process_instance",
    target: (args) => args.processInstanceId,
    available: current,
  })
  const cancelled = cancel.done.has(instanceId)
  const isActionable = current && !cancelled
  // The suspend/activate success only bridges the gap until the instance
  // refetches — fresh server data must win again.
  const suspension = useEngineAction<SuspensionArgs>({
    tool: "camunda7_set_process_instance_suspension",
    target: (args) => args.processInstanceId,
    resetOn: data,
    available: isActionable,
  })

  // Standalone (camunda7_show_instance_detail) the `engine` prop is undefined; fall
  // back to the engine the data was fetched against — mutations (and the AI
  // prompts) must target the exact engine this data came from, never the caller's
  // default engine, which can differ if the default-engine save raced or failed.
  const engineId = engine ?? data?.engineId
  const recovery = useIncidentRecovery(engineId, { resetOn: data, available: isActionable })
  const isSuspended =
    suspension.done.get(instanceId)?.args.suspended ?? data?.instance.suspended ?? false

  // The requests only fire from post-guard UI (data is loaded by then) — the
  // early returns exist for the type system.
  function requestSuspendToggle() {
    if (!data) return
    suspension.run(
      { processInstanceId: data.instance.id, suspended: !isSuspended, engine: engineId },
      { confirm: suspensionConfirmation(t, !isSuspended, data.instance, engineId) },
    )
  }

  function requestCancel() {
    if (!data) return
    cancel.run(
      { processInstanceId: data.instance.id, engine: engineId },
      { confirm: cancelConfirmation(t, data.instance, engineId) },
    )
  }

  return {
    engineId,
    isSuspended,
    cancelled,
    isActionable,
    // The engine refuses to complete a suspended instance's task.
    canCompleteTasks: isActionable && !isSuspended,
    canSuspend: suspension.allowed,
    canCancel: cancel.allowed,
    isMutatingInstance: suspension.pending() || cancel.pending(),
    recovery,
    suspension,
    cancel,
    requestSuspendToggle,
    requestCancel,
  }
}

export type InstanceActions = ReturnType<typeof useInstanceActions>
