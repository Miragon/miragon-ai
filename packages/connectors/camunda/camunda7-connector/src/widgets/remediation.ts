/**
 * Shared guarded-remediation hand-off, used by the engine-health overview's
 * cluster rows AND the cluster-detail view — the AI-first replacement for a
 * blunt "retry all". The prompt only carries the cluster's ids and the tools
 * this deployment has; the playbook itself (classify → idempotency gate →
 * retry scoped to THIS cluster's failed jobs → confirm) is generic and lives
 * in the module's server instructions (`instructions.ts`), gated by the same
 * toolset. A widget never one-clicks a destructive batch.
 */
import type { ToolSurface } from "@miragon-ai/widget-shell/widgets"
import type { HandOff } from "./lib/hand-off.js"

import type { ClusterCounts } from "../view-models.js"

/** Placeholder for an unresolvable process definition key. */
export const UNKNOWN_KEY = "(unknown)"

export interface RemediationCluster extends ClusterCounts {
  activityId: string
  incidentType: string
  processDefinitionKeys: string[]
  representativeMessage: string | null
}

/**
 * A cluster's size as a hand-off fact: the exact `incidentCount`, or — when a
 * capped scan vouches only for its share (#335) — that share as
 * `incidentCountAtLeast`, never passed off as the total.
 */
export function clusterCountFacts(counts: ClusterCounts): {
  incidentCount?: number
  incidentCountAtLeast?: number
} {
  return counts.incidentCount === null
    ? { incidentCountAtLeast: counts.scannedIncidentCount }
    : { incidentCount: counts.incidentCount }
}

export interface RemediationHandOff {
  handOff: HandOff
  /**
   * Whether the deployment can apply a fix (a retry tool is registered for
   * the model). Without one the hand-off is a diagnosis + ticket draft, and
   * the button says so.
   */
  canFix: boolean
}

/**
 * The cluster hand-off for `engine` — always the id the operator is looking
 * at (never a placeholder: `engine` is a boot-time enum, so anything else is
 * a refused call); omitted, the call routes like any engine-less one.
 */
export function remediationHandOff(
  cluster: RemediationCluster,
  engine: string | undefined,
  surface: ToolSurface,
): RemediationHandOff {
  const keys = cluster.processDefinitionKeys.filter((k) => k !== UNKNOWN_KEY)
  const canFix =
    surface.has("camunda7_set_job_retries") || surface.has("camunda7_set_job_retries_batch")
  return {
    canFix,
    handOff: {
      intent: canFix ? "askAi.cluster.fix" : "askAi.cluster.diagnose",
      ids: {
        engine,
        activityId: cluster.activityId,
        incidentType: cluster.incidentType,
        // One key scopes every call; several scope the incident list only.
        processDefinitionKey: keys.length === 1 ? keys[0] : undefined,
        processDefinitionKeyIn: keys.length > 1 ? keys : undefined,
      },
      facts: {
        ...clusterCountFacts(cluster),
        // An unknown 24h count is left out, never a 0 (#335).
        last24h: cluster.last24hCount ? cluster.last24hCount : undefined,
      },
      untrusted: [{ label: "sampleMessage", text: cluster.representativeMessage }],
      tools: [
        "camunda7_list_incidents",
        "camunda7_query_historic_incidents",
        "camunda7_get_job_stacktrace",
        "camunda7_list_jobs",
        "camunda7_get_process_instance_variables",
        "camunda7_set_process_instance_variable",
        "camunda7_set_job_retries",
        "camunda7_set_job_retries_batch",
        "camunda7_format_incident_issue",
      ],
    },
  }
}
