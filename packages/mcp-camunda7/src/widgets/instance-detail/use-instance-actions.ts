import { useState } from "react"
import { useToolMutation } from "@miragon/mcp-toolkit-ui"
import { useResetOnChange } from "@miragon-ai/widget-shell/widgets"

import type { InstanceDetailData } from "../../view-models.js"
import type { ResolveError } from "../process-incidents/incident-table.js"
import { refreshCockpitData } from "../refresh.js"

/**
 * All mutation state of the instance-detail view: incident resolve marks,
 * suspend/activate, cancel, and the confirm-dialog switches. The UI faces of
 * this state are `InstanceHeader` (the action buttons) and
 * `InstanceActionDialogs` (the confirmations).
 */
export function useInstanceActions({
  engine,
  data,
}: {
  engine?: string
  data: InstanceDetailData | null
}) {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [resolveError, setResolveError] = useState<ResolveError | null>(null)
  // null = follow server state; true/false = local override after a suspend/activate.
  const [suspendedOverride, setSuspendedOverride] = useState<boolean | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmSuspension, setConfirmSuspension] = useState(false)
  const [confirmResolveId, setConfirmResolveId] = useState<string | null>(null)
  const resolveMutation = useToolMutation("camunda7_resolve_incident")
  const suspensionMutation = useToolMutation("camunda7_set_process_instance_suspension")
  const cancelMutation = useToolMutation("camunda7_delete_process_instance")
  // The suspend/activate override and the optimistic resolved marks (mirrors
  // process-incidents/list) only bridge the gap until the feed refetches —
  // fresh server data must win again.
  useResetOnChange(data, () => {
    setSuspendedOverride(null)
    setResolvedIds(new Set())
  })

  const isSuspended = suspendedOverride ?? data?.instance.suspended ?? false
  // Standalone (camunda7_show_instance_detail) the `engine` prop is undefined; fall
  // back to the engine the data was fetched against — mutations (and the AI
  // prompts) must target the exact engine this data came from, never the session
  // default, which can differ if the sticky select raced or failed.
  const engineId = engine ?? data?.engineId

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
    isMutatingInstance: suspensionMutation.isPending || cancelMutation.isPending,
    resolvedIds,
    pendingIds,
    resolveError,
    confirmCancel,
    setConfirmCancel,
    confirmSuspension,
    setConfirmSuspension,
    confirmResolveId,
    setConfirmResolveId,
    suspensionMutation,
    cancelMutation,
    handleResolve,
    handleSuspendToggle,
    handleCancel,
    requestSuspendToggle,
    requestCancel,
  }
}

export type InstanceActions = ReturnType<typeof useInstanceActions>
