import type { Client } from "@miragon-ai/client-cibseven"
import {
  getProcessDefinitions,
  getProcessDefinitionStatistics,
} from "@miragon-ai/client-cibseven/sdk"

export interface DefinitionInfo {
  id: string
  key: string
  name: string | null
  version: number | null
}

interface DefinitionStatsRow {
  id?: string | null
  instances?: number | null
  definition?: {
    id?: string | null
    key?: string | null
    name?: string | null
    version?: number | null
  } | null
}

/**
 * Name / latest version / running-instance count per definition key, resolved
 * from the cluster-wide definition statistics in a single round-trip, with a
 * `/process-definition` fallback for keys that carry no running instances (or
 * when stats are unavailable). Shared by the incident panels and the process
 * detail builder so the stats-with-fallback trick lives exactly once.
 */
export async function fetchDefinitionInfo(
  client: Client,
  keys: string[],
): Promise<Map<string, { info: DefinitionInfo; instances: number | null }>> {
  if (keys.length === 0) return new Map()

  const stats = (await getProcessDefinitionStatistics({
    client,
    query: {},
  }).catch(() => [])) as unknown as DefinitionStatsRow[]

  const wantedKeys = new Set(keys)
  const byKey = new Map<string, { info: DefinitionInfo; instances: number | null }>()
  for (const row of Array.isArray(stats) ? stats : []) {
    const def = row.definition
    if (!def?.key || !wantedKeys.has(def.key)) continue
    const existing = byKey.get(def.key)
    const candidate: DefinitionInfo = {
      id: def.id ?? "",
      key: def.key,
      name: def.name ?? null,
      version: typeof def.version === "number" ? def.version : null,
    }
    // Prefer the latest version for the same key.
    if (
      !existing ||
      (candidate.version !== null &&
        (existing.info.version === null || candidate.version > existing.info.version))
    ) {
      byKey.set(def.key, { info: candidate, instances: row.instances ?? null })
    }
  }

  // Fallback for keys not in stats (e.g. all instances ended) — fetch via /process-definition.
  const missing = keys.filter((k) => !byKey.has(k))
  if (missing.length > 0) {
    const defs = (await getProcessDefinitions({
      client,
      query: {
        keysIn: missing.join(","),
        latestVersion: true,
      },
    }).catch(() => [])) as unknown as Array<{
      id?: string
      key?: string
      name?: string | null
      version?: number
    }>
    for (const d of Array.isArray(defs) ? defs : []) {
      if (!d.key) continue
      byKey.set(d.key, {
        info: {
          id: d.id ?? "",
          key: d.key,
          name: d.name ?? null,
          version: typeof d.version === "number" ? d.version : null,
        },
        instances: 0,
      })
    }
  }

  return byKey
}

/** Single-key convenience over {@link fetchDefinitionInfo}. */
export async function fetchSingleDefinitionInfo(
  client: Client,
  key: string,
): Promise<{ info: DefinitionInfo | null; runningInstances: number | null }> {
  const hit = (await fetchDefinitionInfo(client, [key])).get(key)
  return hit
    ? { info: hit.info, runningInstances: hit.instances }
    : { info: null, runningInstances: null }
}
