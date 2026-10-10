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

/**
 * Whether the scan held EVERY incident of the cluster. The cluster's process
 * keys come from the scanned incidents only, so they are the cluster's keys
 * only then — a capped scan (#335) knows the keys of its newest share, and
 * scoping a fix by them would hide the rest of the cluster from it.
 */
export function clusterScanComplete(counts: ClusterCounts): boolean {
  return counts.incidentCount !== null && counts.incidentCount <= counts.scannedIncidentCount
}

/**
 * The cluster's process keys (the unresolvable placeholder dropped) as
 * hand-off parts: a scope (one key scopes every call; several the incident
 * list only) while the scan held the whole cluster, else a fact naming whose
 * keys they are.
 */
export function clusterKeyParts(
  counts: ClusterCounts,
  processDefinitionKeys: readonly string[],
): {
  processDefinitionKey?: string
  processDefinitionKeyIn?: readonly string[]
  scannedProcessDefinitionKeys?: readonly string[]
} {
  const keys = processDefinitionKeys.filter((k) => k !== UNKNOWN_KEY)
  if (keys.length === 0) return {}
  if (!clusterScanComplete(counts)) return { scannedProcessDefinitionKeys: keys }
  return keys.length === 1 ? { processDefinitionKey: keys[0] } : { processDefinitionKeyIn: keys }
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
  const keys = clusterKeyParts(cluster, cluster.processDefinitionKeys)
  // Confirmed only: a surface that cannot know offers the diagnosis.
  const canFix =
    surface.has("camunda7_set_job_retries") === true ||
    surface.has("camunda7_set_job_retries_batch") === true
  return {
    canFix,
    handOff: {
      intent: canFix ? "askAi.cluster.fix" : "askAi.cluster.diagnose",
      ids: {
        engine,
        activityId: cluster.activityId,
        incidentType: cluster.incidentType,
        processDefinitionKey: keys.processDefinitionKey,
        processDefinitionKeyIn: keys.processDefinitionKeyIn,
      },
      facts: {
        ...clusterCountFacts(cluster),
        scannedProcessDefinitionKeys: keys.scannedProcessDefinitionKeys,
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
