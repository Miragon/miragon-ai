import type { IncidentInstance } from "../../view-models.js"
import { useT, type T } from "../../messages/use-t.js"
import { recoveryOf } from "../lib/incident-recovery.js"
import { useEngineAction, type ActionConfirmation, type TargetLine } from "../lib/engine-action.js"

/** The button an incident row offers. */
export type RowAction = "resolve" | "retry"

/** What a recovery acts on: the incident — and, for a retry, its job or external task. */
export type RecoverableIncident = Pick<
  IncidentInstance,
  "id" | "incidentType" | "processInstanceId" | "recovery"
>

interface ResolveArgs extends Record<string, unknown> {
  incidentId: string
  engine?: string
}

interface JobRetryArgs extends Record<string, unknown> {
  jobId: string
  retries: number
  engine?: string
}

interface ExternalTaskRetryArgs extends Record<string, unknown> {
  externalTaskId: string
  retries: number
  engine?: string
}

/** The resolve question, naming the incident, its type, its instance and engine. */
export function resolveConfirmation(
  t: T,
  incident: RecoverableIncident,
  engineId: string | undefined,
): ActionConfirmation {
  const lines: TargetLine[] = [
    [t("confirmDialog.incidentType"), incident.incidentType],
    [t("confirmDialog.instance"), incident.processInstanceId],
  ]
  if (engineId) lines.push([t("confirmDialog.engine"), engineId])
  return {
    title: t("confirmDialog.resolveTitle"),
    description: t("confirmDialog.resolveDescription"),
    target: [[t("confirmDialog.incident"), incident.id], ...lines],
    confirmLabel: t("confirmDialog.resolveConfirm"),
    keepLabel: t("confirmDialog.resolveKeep"),
  }
}

/**
 * The incident remedies of every incident surface (definition view rows,
 * instance detail rows, the incident detail). The ENGINE decides which
 * write clears an incident (the feed's `recovery`, from the engine
 * contract): a custom incident is resolved — after a confirmation that names
 * it — but the built-in types refuse resolve with a 400, so a failedJob /
 * failedExternalTask offers Retry (retries = 1) instead. Each remedy is an
 * `EngineAction`: offered only where the deployment's toolset registers its
 * tool, refreshing the incident views after it succeeded, its success marks
 * dropped when `resetOn` (the feed data) changes — fresh server data wins.
 */
export function useIncidentRecovery(engineId: string | undefined, resetOn: unknown) {
  const t = useT()
  const resolve = useEngineAction<ResolveArgs>({
    tool: "camunda7_resolve_incident",
    target: (args) => args.incidentId,
    resetOn,
  })
  const jobRetry = useEngineAction<JobRetryArgs>({
    tool: "camunda7_set_job_retries",
    target: (args) => args.jobId,
    resetOn,
  })
  const taskRetry = useEngineAction<ExternalTaskRetryArgs>({
    tool: "camunda7_set_external_task_retries",
    target: (args) => args.externalTaskId,
    resetOn,
  })

  /** The action that clears `incident`, the target it runs on, and how to start it — null when none does. */
  function remedyOf(incident: RecoverableIncident, jobId?: string | null) {
    const recovery = recoveryOf(incident, jobId)
    switch (recovery.action) {
      case "resolve":
        return {
          kind: "resolve" as const,
          action: resolve,
          target: incident.id,
          start: () =>
            resolve.run(
              { incidentId: incident.id, engine: engineId },
              { confirm: resolveConfirmation(t, incident, engineId) },
            ),
        }
      case "retry-job":
        return {
          kind: "retry" as const,
          action: jobRetry,
          target: recovery.jobId,
          start: () => jobRetry.run({ jobId: recovery.jobId, retries: 1, engine: engineId }),
        }
      case "retry-external-task":
        return {
          kind: "retry" as const,
          action: taskRetry,
          target: recovery.externalTaskId,
          start: () =>
            taskRetry.run({
              externalTaskId: recovery.externalTaskId,
              retries: 1,
              engine: engineId,
            }),
        }
      default:
        return null
    }
  }

  return {
    /** The resolve action — its confirmation is rendered by `EngineActionDialog`. */
    resolve,
    /** The row's button — null when the incident type or the toolset offers none. */
    actionFor(incident: RecoverableIncident, jobId?: string | null): RowAction | null {
      const remedy = remedyOf(incident, jobId)
      return remedy?.action.allowed ? remedy.kind : null
    },
    /** Cleared in this session (until the feed refetches). */
    isDone(incident: RecoverableIncident, jobId?: string | null): boolean {
      const remedy = remedyOf(incident, jobId)
      return remedy !== null && remedy.action.done.has(remedy.target)
    },
    isPending(incident: RecoverableIncident, jobId?: string | null): boolean {
      const remedy = remedyOf(incident, jobId)
      return remedy !== null && remedy.action.pending(remedy.target)
    },
    /** The remedy's last failure, shown at the incident. */
    errorOf(incident: RecoverableIncident, jobId?: string | null): string | null {
      const remedy = remedyOf(incident, jobId)
      return remedy ? remedy.action.error(remedy.target) : null
    },
    /** The row button: Resolve asks first, Retry runs at once. */
    act(incident: RecoverableIncident, jobId?: string | null) {
      remedyOf(incident, jobId)?.start()
    },
  }
}

export type IncidentRecoveryState = ReturnType<typeof useIncidentRecovery>
