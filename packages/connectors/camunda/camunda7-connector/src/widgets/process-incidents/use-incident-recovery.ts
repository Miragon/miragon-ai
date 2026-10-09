import { useState } from "react"
import { useToolMutation } from "@miragon/mcp-toolkit-ui"
import { useResetOnChange } from "@miragon-ai/widget-shell/widgets"

import type { IncidentInstance, IncidentRecovery } from "../../view-models.js"
import { refreshCockpitData } from "../refresh.js"
import { useCanRun } from "../widget-actions.js"

/** A failed row action, surfaced inline under the affected incident row. */
export interface RecoveryError {
  incidentId: string
  message: string
}

/** The button an incident row offers. */
export type RowAction = "resolve" | "retry"

type Callbacks = Parameters<ReturnType<typeof useToolMutation>["mutate"]>[1]

function addTo(set: Set<string>, id: string): Set<string> {
  return new Set(set).add(id)
}

function removeFrom(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  next.delete(id)
  return next
}

/**
 * The incident row actions of the list views (definition view and instance
 * detail). The ENGINE decides which action clears an incident (the feed's
 * `recovery`, from the engine contract): a custom incident is resolved —
 * after a confirmation — but the built-in types refuse resolve with a 400, so
 * a failedJob / failedExternalTask row offers Retry (retries = 1) instead.
 * Each button renders only when the deployment's toolset registers its tool.
 *
 * `doneIds` are the optimistic marks of this session; they only bridge the
 * gap until `resetOn` (the feed data) changes — fresh server data wins.
 */
export function useIncidentRecovery(engineId: string | undefined, resetOn: unknown) {
  const canRun = useCanRun()
  const resolveMutation = useToolMutation("camunda7_resolve_incident")
  const jobRetryMutation = useToolMutation("camunda7_set_job_retries")
  const externalTaskRetryMutation = useToolMutation("camunda7_set_external_task_retries")
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<RecoveryError | null>(null)
  const [confirmResolveId, setConfirmResolveId] = useState<string | null>(null)
  useResetOnChange(resetOn, () => setDoneIds(new Set()))

  function actionFor(recovery: IncidentRecovery): RowAction | null {
    switch (recovery.action) {
      case "resolve":
        return canRun("camunda7_resolve_incident") ? "resolve" : null
      case "retry-job":
        return canRun("camunda7_set_job_retries") ? "retry" : null
      case "retry-external-task":
        return canRun("camunda7_set_external_task_retries") ? "retry" : null
      default:
        return null
    }
  }

  function run(incidentId: string, mutate: (callbacks: Callbacks) => void) {
    setError(null)
    setPendingIds((prev) => addTo(prev, incidentId))
    mutate({
      onSuccess: () => {
        setDoneIds((prev) => addTo(prev, incidentId))
        setConfirmResolveId(null)
        // Sibling widgets (KPI, header, BPMN flow) share the feed key —
        // refetch so their counts reflect the change.
        refreshCockpitData()
      },
      onError: (err) => setError({ incidentId, message: err.message }),
      onSettled: () => setPendingIds((prev) => removeFrom(prev, incidentId)),
    })
  }

  /** The row button: Resolve asks for confirmation first, Retry runs at once. */
  function act({ id, recovery }: IncidentInstance) {
    if (recovery.action === "resolve") {
      resolveMutation.reset()
      setConfirmResolveId(id)
    } else if (recovery.action === "retry-job") {
      const args = { jobId: recovery.jobId, retries: 1, engine: engineId }
      run(id, (callbacks) => jobRetryMutation.mutate(args, callbacks))
    } else if (recovery.action === "retry-external-task") {
      const args = { externalTaskId: recovery.externalTaskId, retries: 1, engine: engineId }
      run(id, (callbacks) => externalTaskRetryMutation.mutate(args, callbacks))
    }
  }

  function confirmResolve() {
    const incidentId = confirmResolveId
    if (!incidentId) return
    run(incidentId, (callbacks) =>
      resolveMutation.mutate({ incidentId, engine: engineId }, callbacks),
    )
  }

  return {
    doneIds,
    pendingIds,
    error,
    confirmResolveId,
    setConfirmResolveId,
    actionFor,
    act,
    confirmResolve,
  }
}

export type IncidentRecoveryState = ReturnType<typeof useIncidentRecovery>
