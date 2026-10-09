import type { Client } from "@miragon-ai/camunda7-client"
import {
  getProcessDefinitionByKey,
  getProcessDefinitionStatistics,
} from "@miragon-ai/camunda7-client/sdk"
import { rowsOf } from "./engine-reads.js"

/**
 * Definition lookups shared by every builder (CLAUDE.md invariant 7): the
 * id parsers, the single-key lookup and the per-KEY fold of the engine's
 * per-VERSION definition statistics. A process definition key spans every
 * deployed version, and old versions keep running after a redeploy — so a
 * view that is about a key sums over all of them, and only a diagram is ever
 * one version.
 */

export interface DefinitionInfo {
  id: string
  key: string
  name: string | null
  version: number
}

/**
 * Camunda 7 / CIB Seven definition ids are `<key>:<version>:<deploymentId>`.
 * `/incident` and `/process-instance` rows carry the id but not the key, so
 * the key is parsed from it — the whole id when it has no `:`.
 */
export function processDefinitionKeyFromId(id: string): string {
  const idx = id.indexOf(":")
  return idx > 0 ? id.slice(0, idx) : id
}

/** The version segment of a definition id; null when it is no number. */
export function definitionVersionFromId(id: string | null | undefined): number | null {
  const segment = id?.split(":")[1]
  return segment && /^\d+$/.test(segment) ? Number(segment) : null
}

interface RawDefinition {
  id?: string | null
  key?: string | null
  name?: string | null
  version?: number | null
}

function toDefinitionInfo(raw: RawDefinition, key: string): DefinitionInfo {
  return {
    id: raw.id ?? "",
    key: raw.key ?? key,
    name: raw.name ?? null,
    version: typeof raw.version === "number" ? raw.version : (definitionVersionFromId(raw.id) ?? 0),
  }
}

/**
 * The latest deployed version of `key` — `GET /process-definition/key/{key}`,
 * one indexed lookup. An unknown key is the engine's 404, and it propagates:
 * a mistyped key is a not-found error, never a view of zeros.
 */
export async function fetchLatestDefinition(client: Client, key: string): Promise<DefinitionInfo> {
  const raw = (await getProcessDefinitionByKey({ client, path: { key } })) as RawDefinition
  return toDefinitionInfo(raw ?? {}, key)
}

interface IncidentStatRow {
  incidentType?: string | null
  incidentCount?: number | null
}

interface DefinitionStatsRow {
  id?: string | null
  instances?: number | null
  failedJobs?: number | null
  incidents?: IncidentStatRow[] | null
  definition?: RawDefinition | null
}

/** One key's definition statistics, summed over EVERY deployed version. */
export interface KeyStats {
  /** The key's highest deployed version (name, version, id for links). */
  latest: DefinitionInfo
  instances: number
  failedJobs: number
  /** Open incidents per incident type. */
  incidentsByType: Map<string, number>
  incidentCount: number
  /** Ids of the versions that carry open incidents — where activity statistics are read. */
  incidentVersionIds: string[]
}

function incidentSum(row: DefinitionStatsRow): number {
  return (row.incidents ?? []).reduce((sum, i) => sum + (i.incidentCount ?? 0), 0)
}

function addVersion(stats: KeyStats, row: DefinitionStatsRow, version: DefinitionInfo): void {
  stats.instances += row.instances ?? 0
  stats.failedJobs += row.failedJobs ?? 0
  for (const incident of row.incidents ?? []) {
    const type = incident.incidentType ?? "unknown"
    stats.incidentsByType.set(
      type,
      (stats.incidentsByType.get(type) ?? 0) + (incident.incidentCount ?? 0),
    )
  }
  const incidents = incidentSum(row)
  stats.incidentCount += incidents
  if (incidents > 0 && version.id) stats.incidentVersionIds.push(version.id)
  if (version.version > stats.latest.version) stats.latest = version
}

/**
 * Folds `/process-definition/statistics` (one row per deployed VERSION) into
 * one entry per KEY: instances, failed jobs and incidents summed over all
 * versions, the latest version kept for display. Rows without a key cannot be
 * attributed and are skipped.
 */
export function foldStatsByKey(rows: unknown): Map<string, KeyStats> {
  const byKey = new Map<string, KeyStats>()
  for (const row of rowsOf<DefinitionStatsRow>(rows)) {
    const key = row.definition?.key
    if (!key) continue
    const version = toDefinitionInfo({ ...row.definition, id: row.definition?.id ?? row.id }, key)
    const stats = byKey.get(key) ?? {
      latest: version,
      instances: 0,
      failedJobs: 0,
      incidentsByType: new Map<string, number>(),
      incidentCount: 0,
      incidentVersionIds: [],
    }
    addVersion(stats, row, version)
    byKey.set(key, stats)
  }
  return byKey
}

/**
 * The engine's definition statistics folded per key — ONE engine-wide call
 * (the endpoint has no key filter), so callers read it only when a view
 * genuinely spans keys or needs the versions behind a key.
 */
export async function fetchStatsByKey(
  client: Client,
  query: { failedJobs?: boolean; incidentsForType?: string },
): Promise<Map<string, KeyStats>> {
  // `incidentsForType` narrows the incident counts to one type; without it
  // every type is counted (`incidents: true`). The engine takes one or the other.
  const stats = await getProcessDefinitionStatistics({
    client,
    query: {
      failedJobs: query.failedJobs,
      ...(query.incidentsForType
        ? { incidentsForType: query.incidentsForType }
        : { incidents: true }),
    },
  })
  return foldStatsByKey(stats)
}
