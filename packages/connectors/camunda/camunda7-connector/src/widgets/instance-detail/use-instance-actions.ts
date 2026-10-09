import { useState } from "react"
import { useToolMutation } from "@miragon/mcp-toolkit-ui"
import { useResetOnChange } from "@miragon-ai/widget-shell/widgets"

import type { InstanceDetailData } from "../../view-models.js"
import { useIncidentRecovery } from "../process-incidents/use-incident-recovery.js"
import { refreshCockpitData } from "../refresh.js"
import { useCanRun } from "../widget-actions.js"

/**
 * All mutation state of the instance-detail view: incident row actions
 * (resolve/retry, `useIncidentRecovery`), suspend/activate, cancel, and the
 * confirm-dialog switches. The UI faces of
 * this state are `InstanceHeader` (the action buttons) and
 * `InstanceActionDialogs` (the confirmations). The `can*` flags say which
 * actions the deployment's toolset exposes — the buttons render only for those.
 */
export function useInstanceActions({
  engine,
  data,
}: {
  engine?: string
  data: InstanceDetailData | null
}) {
  // null = follow server state; true/false = local override after a suspend/activate.
  const [suspendedOverride, setSuspendedOverride] = useState<boolean | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmSuspension, setConfirmSuspension] = useState(false)
  const suspensionMutation = useToolMutation("camunda7_set_process_instance_suspension")
  const cancelMutation = useToolMutation("camunda7_delete_process_instance")
  const canRun = useCanRun()
  // The suspend/activate override only bridges the gap until the feed
  // refetches — fresh server data must win again (the incident marks reset
  // the same way inside useIncidentRecovery).
  useResetOnChange(data, () => setSuspendedOverride(null))

  const isSuspended = suspendedOverride ?? data?.instance.suspended ?? false
  // Standalone (camunda7_show_instance_detail) the `engine` prop is undefined; fall
  // back to the engine the data was fetched against — mutations (and the AI
  // prompts) must target the exact engine this data came from, never the caller's
  // default engine, which can differ if the default-engine save raced or failed.
  const engineId = engine ?? data?.engineId
  const recovery = useIncidentRecovery(engineId, data)

  // The handlers below only fire from post-guard UI (data is loaded by then) —
  // the early returns exist for the type system.
  function handleSuspendToggle() {
    if (!data) return
    suspensionMutation.mutate(
      { processInstanceId: data.instance.id, suspended: !isSuspended, engine: engineId },
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
    if (!data) return
    cancelMutation.mutate(
      { processInstanceId: data.instance.id, engine: engineId },
      {
        onSuccess: () => {
          setCancelled(true)
          setConfirmCancel(false)
          refreshCockpitData()
        },
      },
    )
  }

  function requestSuspendToggle() {
    suspensionMutation.reset()
    setConfirmSuspension(true)
  }

  function requestCancel() {
    cancelMutation.reset()
    setConfirmCancel(true)
  }

  return {
    engineId,
    isSuspended,
    cancelled,
    canSuspend: canRun("camunda7_set_process_instance_suspension"),
    canCancel: canRun("camunda7_delete_process_instance"),
    isMutatingInstance: suspensionMutation.isPending || cancelMutation.isPending,
    recovery,
    confirmCancel,
    setConfirmCancel,
    confirmSuspension,
    setConfirmSuspension,
    suspensionMutation,
    cancelMutation,
    handleSuspendToggle,
    handleCancel,
    requestSuspendToggle,
    requestCancel,
  }
}

export type InstanceActions = ReturnType<typeof useInstanceActions>
