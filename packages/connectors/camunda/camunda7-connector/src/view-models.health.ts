/**
 * View-model contracts of the engine-health verdict and its failure-cluster
 * drill-in — shared by `src/data/health-data.ts`, `src/data/cluster-detail-data.ts`,
 * the widget tools and the widgets. Re-exported from `view-models.ts`.
 */

// === Engine health verdict (camunda7_show_engine_health) ===

export type EngineHealthStatus = "ok" | "degraded" | "critical"

/**
 * A failure cluster's size as far as the health views' newest-first incident
 * scan (`CLUSTER_SCAN_LIMIT`) can vouch for it. A cluster larger than the
 * scan is known only as a lower bound — never the scan's length as its size.
 */
export interface ClusterCounts {
  /** The cluster's open incidents — null when unknown (only `scannedIncidentCount` of it is). */
  incidentCount: number | null
  /** The cluster's incidents among the newest scanned ones — a lower bound of `incidentCount`. */
  scannedIncidentCount: number
  /** Incidents since now − 24h — null when neither the scan nor a count can vouch for them. */
  last24hCount: number | null
}

/**
 * A cross-process incident cluster: the same activity failing the same way
 * (`activityId` + `incidentType` + normalized failure-message signature) across
 * one or more process definitions. This is the root-cause unit a support
 * operator triages — surfaced instead of a flat per-instance incident list. The
 * plain-language interpretation and the recommended fix are the host agent's
 * job (the "ask the AI" handoff), not the server's: the cluster carries only
 * deterministic, grounded facts. Its counts are exact only when the scan read
 * every open incident (24h: when it reaches back that far); the clusters rank
 * by `scannedIncidentCount`.
 */
export interface EngineHealthCluster extends ClusterCounts {
  /** Stable key `${activityId}::${incidentType}::${messageSignature}` — used for React keys. */
  id: string
  activityId: string
  /** The activity's name in the diagram of the sample incident's version — null without one (or unreadable). */
  activityName: string | null
  incidentType: string
  /** Normalized failure-message signature — the third clustering dimension; drill filter. */
  messageSignature: string
  /** Distinct process definition keys this cluster spans, most-affected first. */
  processDefinitionKeys: string[]
  /** Name of the most-affected process (its latest version) — null without one. */
  processDefinitionName: string | null
  /** A sample message + its incident id, for the drill-in and the AI prompt. */
  representativeMessage: string | null
  representativeIncidentId: string
  latestIncident: string | null
}

export interface EngineHealthData {
  /** Deterministic traffic-light verdict from incident volume + cluster size. */
  status: EngineHealthStatus
  /** How `status` was decided, in words (source + thresholds) — `healthVerdictRule`. */
  statusRule: string
  summary: {
    totalIncidents: number
    /** New incidents in the last hour — the "is it burning right now?" signal. */
    lastHourIncidents: number
    last24hIncidents: number
    /** Activities with open incidents — null unless the incident scan read every incident. */
    affectedActivities: number | null
    /** Definition keys with open incidents. */
    affectedDefinitions: number
    runningInstances: number
    /** Deployed definition keys. */
    totalDefinitions: number
    /** Instances started in the last 24h — null when the history API is unavailable. */
    started24h: number | null
    /** Instances completed in the last 24h — null when the history API is unavailable. */
    completed24h: number | null
  }
  /** Top incident clusters by count (cross-process), most severe first. */
  clusters: EngineHealthCluster[]
  /** When this snapshot was computed (ISO) — rendered as "as of …" for ops trust. */
  fetchedAt: string
  engineId: string
}

// === Cluster detail (camunda7_show_cluster_detail) ===

export interface ClusterIncidentRow {
  incidentId: string
  processInstanceId: string
  /** Business key of the affected instance — the operator's "order number". */
  businessKey: string | null
  processDefinitionKey: string
  /** The process's name (the incident's definition version) — null without one or unread. */
  processDefinitionName: string | null
  incidentTimestamp: string
}

/**
 * Drill-in for ONE failure cluster: the affected instances (business keys
 * first), the full sample message, and the time profile — the middle layer
 * between the engine overview's cluster list and the single-incident detail.
 * Without a message filter the counts are `/incident/count` totals; with one,
 * a count the scan cannot vouch for is null. The list pages over the
 * `scannedIncidentCount` scanned incidents.
 */
export interface ClusterDetailData extends ClusterCounts {
  activityId: string
  /** The activity's name in the newest incident's diagram — null without one or unreadable. */
  activityName: string | null
  incidentType: string
  /** Signature the result was filtered by; null = no message filter (activity+type only). */
  messageSignature: string | null
  /** Incidents in the last hour — null when neither the scan nor a count can vouch for it. */
  lastHourCount: number | null
  /** Null unless the scan holds the whole cluster. */
  firstSeen: string | null
  latestIncident: string | null
  /** Distinct process definition keys of the scanned incidents, most-affected first. */
  processDefinitionKeys: string[]
  representativeMessage: string | null
  /** First page of affected incidents (most recent first). */
  incidents: ClusterIncidentRow[]
  /** The list's total: the scanned incidents after the business-key search (may exceed `incidents.length`). */
  totalMatching: number
  fetchedAt: string
  engineId: string
}
