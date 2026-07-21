/**
 * Shared guarded-remediation handoff, used by the engine-health overview's
 * cluster rows AND the cluster-detail view — the AI-first replacement for a
 * blunt "retry all": classify → check idempotency → scope the retry to THIS
 * cluster's jobs only → confirm. The agent does the judgment + (on
 * confirmation) the execution; a widget never one-clicks a destructive batch.
 */

/** Placeholder for an unresolvable process definition key. */
export const UNKNOWN_KEY = "(unknown)"

export interface RemediationCluster {
  activityId: string
  incidentType: string
  incidentCount: number
  last24hCount: number
  processDefinitionKeys: string[]
  representativeMessage: string | null
}

export function remediatePrompt(cluster: RemediationCluster, engine?: string): string {
  const e = engine ?? "the current engine"
  const procs = cluster.processDefinitionKeys.filter((k) => k !== UNKNOWN_KEY)
  const procFilter = procs[0] ? ` and processDefinitionKey "${procs[0]}"` : ""
  const keyArg = procs[0] ? `"${procs[0]}"` : "<processDefinitionKey>"
  return (
    `Help me fix this incident cluster on engine "${e}", step by step and in plain language for a ` +
    `distribution-center support operator (no Camunda jargon). The cluster: activity ` +
    `"${cluster.activityId}" failing as ${cluster.incidentType} — ${cluster.incidentCount} incidents` +
    (cluster.last24hCount > 0 ? ` (${cluster.last24hCount} in the last 24h)` : "") +
    (procs.length ? ` across ${procs.join(", ")}` : "") +
    `. Sample message: ${cluster.representativeMessage ?? "(none)"}.\n\n` +
    `1) Confirm the root cause with camunda7_list_incidents (incidentType "${cluster.incidentType}"` +
    procFilter +
    `) and camunda7_query_historic_activity_instances; classify it: transient / data / config / model.\n` +
    `2) Choose the fix by class — transient (external system back up) → retry; bad input data → fix the ` +
    `variable (camunda7_set_process_instance_variable) then retry; code/model defect → do NOT retry (it ` +
    `re-fails), escalate and draft a ticket (camunda7_format_incident_issue).\n` +
    `3) Idempotency gate: before any retry, decide whether re-running "${cluster.activityId}" could cause ` +
    `a real-world side effect (double shipment, double booking). If unsure, say so and do not retry.\n` +
    `4) If a retry is safe, scope it to THIS cluster ONLY — never "retry all": list exactly these failed ` +
    `jobs via camunda7_list_jobs({ engine: "${e}", processDefinitionKey: ${keyArg}, noRetriesLeft: true }), ` +
    `keep only activity "${cluster.activityId}", and propose ` +
    `camunda7_set_job_retries_batch on exactly those job ids.\n\n` +
    `Show me the plan and the affected count first, and execute nothing until I confirm.`
  )
}
