import type { Client } from "@miragon-ai/camunda7-client"
import {
  getProcessDefinitionStatistics,
  getProcessDefinitions,
} from "@miragon-ai/camunda7-client/sdk"
import {
  bpmnProcessNameOf,
  readBpmnNames,
  type BpmnModelNames,
} from "@miragon-ai/widget-shell/server"
import { fetchDefinitionXml } from "../lib/definition-xml.js"
import { rowsOf } from "./engine-reads.js"

// The one cached XML read (`lib/definition-xml.ts`), offered with the other
// definition lookups.
export { fetchDefinitionXml }

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
 * The key a definition id names. Camunda 7 / CIB Seven definition ids are
 * `<key>:<version>:<deploymentId>` — but the engine falls back to a bare
 * generated id when that would exceed 64 characters (any key longer than ~25
 * characters with UUID ids), and a bare id names no key: null. A key never
 * contains `:` (BPMN ids are NCNames), so an id with one names its key exactly.
 */
export function definitionKeyInId(id: string): string | null {
  const idx = id.indexOf(":")
  return idx > 0 ? id.slice(0, idx) : null
}

/**
 * `/incident` and `/process-instance` rows carry the definition id but not
 * the key, so the key is parsed from it — the whole id when it is a bare one
 * ({@link definitionKeyInId}). A display fallback only: a key that scopes a
 * query, a drill, a hand-off or a cockpit link resolves the id
 * ({@link resolveDefinitionKeys}).
 */
export function processDefinitionKeyFromId(id: string): string {
  return definitionKeyInId(id) ?? id
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
 * The highest deployed version of `key` over EVERY tenant — the list
 * endpoint, one indexed lookup; null when no version is deployed.
 * `GET /process-definition/key/{key}` is no substitute: it only finds the
 * definitions that belong to NO tenant, so a tenant deployment (which
 * `camunda7_create_deployment` makes) would read as unknown.
 */
export async function findLatestDefinition(
  client: Client,
  key: string,
): Promise<DefinitionInfo | null> {
  const [latest] = rowsOf<RawDefinition>(
    await getProcessDefinitions({
      client,
      query: { key, latestVersion: true, sortBy: "version", sortOrder: "desc", maxResults: 1 },
    }),
  )
  return latest ? toDefinitionInfo(latest, key) : null
}

/**
 * {@link findLatestDefinition} for a view ABOUT the key: an unknown key
 * propagates as a not-found error — a mistyped key is never a view of zeros.
 */
export async function fetchLatestDefinition(client: Client, key: string): Promise<DefinitionInfo> {
  const latest = await findLatestDefinition(client, key)
  if (!latest) throw unknownKeyError(key)
  return latest
}

/** The not-found error of a view scoped to a key no version is deployed for. */
export function unknownKeyError(key: string): Error {
  return new Error(`No process definition with key "${key}" is deployed on this engine.`)
}

/**
 * How many diagrams one view reads for display names at most: a page of
 * jobs or a cluster list rarely spans more definitions, and the names are
 * enrichment — a definition past the cap shows its ids.
 */
export const NAMED_DEFINITIONS_LIMIT = 8

/** The names in the diagrams of a view's definition versions, by definition id. */
export type NamesByDefinition = ReadonlyMap<string, BpmnModelNames>

/**
 * The display names in the diagrams of `definitionIds`, by definition id:
 * each process's (its own, else its pool's) and every named element, read by
 * the one rule every module names a model by (`readBpmnNames`, widget-shell:
 * a Modeler line break or `&#38;` decoded, so analytics shows the same
 * words) — one XML read per distinct id, at most
 * {@link NAMED_DEFINITIONS_LIMIT}. ENRICHMENT: each read that fails (or
 * carries no XML) leaves its id out of the map, so the names behind it are
 * null, never the view's failure.
 */
export async function fetchNamesByDefinition(
  client: Client,
  definitionIds: Iterable<string | null | undefined>,
): Promise<NamesByDefinition> {
  const ids = [...new Set([...definitionIds].filter((id): id is string => !!id))].slice(
    0,
    NAMED_DEFINITIONS_LIMIT,
  )
  const read = await Promise.all(
    ids.map(async (id) => {
      const xml = await fetchDefinitionXml(client, id).catch(() => null)
      return xml ? ([id, readBpmnNames(xml)] as const) : null
    }),
  )
  return new Map(read.filter((entry) => entry !== null))
}

/** The name of process `key` in the diagram of `definitionId` (its own, else its pool's), or null. */
export function processNameIn(
  names: NamesByDefinition,
  definitionId: string | null | undefined,
  key: string | null | undefined,
): string | null {
  const model = definitionId ? names.get(definitionId) : undefined
  return model && key ? bpmnProcessNameOf(model, key) : null
}

/** The name of element `elementId` in the diagram of `definitionId`, or null. */
export function elementNameIn(
  names: NamesByDefinition,
  definitionId: string | null | undefined,
  elementId: string | null | undefined,
): string | null {
  const elements = definitionId ? names.get(definitionId)?.elements : undefined
  return elements && elementId && Object.hasOwn(elements, elementId) ? elements[elementId] : null
}

/** A definition a view names: its version id, its key, and the engine's name for it. */
export interface NameableDefinition {
  id?: string | null
  key?: string | null
  name?: string | null
}

/**
 * Names the definitions the engine knows by no name from their diagrams, IN
 * PLACE (each is this view's own fresh read), and returns them. The engine
 * takes a process's name from its `<process>` element alone, while the
 * Camunda Modeler names the POOL of a collaboration and leaves the process
 * unnamed: without this read, camunda7 showed `miraveloLeasing` where
 * analytics shows "Miravelo - Bike Leasing" (the one rule, `readBpmnNames`).
 * One diagram read per unnamed definition, at most
 * {@link NAMED_DEFINITIONS_LIMIT} in the order given (a view passes the rows
 * it shows first, first); a named definition costs nothing. ENRICHMENT: a
 * definition whose diagram is unreadable, or names nothing, keeps its null.
 */
export async function nameUnnamedDefinitions<T extends NameableDefinition>(
  client: Client,
  definitions: T[],
): Promise<T[]> {
  const unnamed = definitions.filter((d) => !d.name && d.id && d.key)
  if (unnamed.length === 0) return definitions
  const names = await fetchNamesByDefinition(
    client,
    unnamed.map((d) => d.id),
  )
  for (const definition of unnamed) {
    definition.name = processNameIn(names, definition.id, definition.key) ?? definition.name ?? null
  }
  return definitions
}

/**
 * The definitions behind `definitionIds` (name, key, version), by id — ONE
 * `/process-definition?processDefinitionIdIn=` read for the whole set. The
 * read propagates: a builder that shows the names as enrichment wraps the
 * call in `optional(...)` and renders the ids without them.
 */
export async function fetchDefinitionsById(
  client: Client,
  definitionIds: Iterable<string | null | undefined>,
): Promise<Map<string, DefinitionInfo>> {
  const ids = [...new Set([...definitionIds].filter((id): id is string => !!id))]
  if (ids.length === 0) return new Map()
  const rows = rowsOf<RawDefinition>(
    await getProcessDefinitions({
      client,
      query: { processDefinitionIdIn: ids.join(","), maxResults: ids.length },
    }),
  )
  return new Map(
    rows
      .filter((row): row is RawDefinition & { id: string } => !!row.id)
      .map((row) => [row.id, toDefinitionInfo(row, row.key ?? definitionKeyInId(row.id) ?? "")]),
  )
}

/**
 * The diagram of a KEY: its latest version over every tenant
 * ({@link findLatestDefinition}), read by id ({@link fetchDefinitionXml}) —
 * the definition view's diagram. Never `GET /process-definition/key/{key}/xml`,
 * which only finds definitions that belong to no tenant. Null when no version
 * is deployed.
 */
export async function fetchLatestDefinitionXml(
  client: Client,
  key: string,
): Promise<string | null> {
  const latest = await findLatestDefinition(client, key)
  return latest?.id ? fetchDefinitionXml(client, latest.id) : null
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
  /** Ids of every deployed version — what a row's definition id resolves through. */
  versionIds: string[]
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
  if (version.id) stats.versionIds.push(version.id)
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
      versionIds: [],
    }
    addVersion(stats, row, version)
    byKey.set(key, stats)
  }
  return byKey
}

/**
 * Maps a row's definition id to its key through the statistics — exact even
 * for a bare generated id. An id the statistics do not list (a version
 * deployed after they were read) falls back to the key it names; a bare one
 * names none and is null — never its UUID passed off as a key.
 */
export function definitionKeyResolver(
  statsByKey: Map<string, KeyStats>,
): (definitionId: string) => string | null {
  const keyById = new Map<string, string>()
  for (const [key, stats] of statsByKey) {
    for (const id of stats.versionIds) keyById.set(id, key)
  }
  return (definitionId) => keyById.get(definitionId) ?? definitionKeyInId(definitionId)
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

/**
 * The keys of rows that carry a definition id but no key — the one
 * resolution every builder uses for them. An id names its key unless it is a
 * bare generated one; only then are the definition statistics read
 * ({@link definitionKeyResolver}): ONE engine-wide call, and none at all for a
 * set of short keys. The read propagates — a builder that treats the keys as
 * enrichment wraps the call in `optional(...)` and falls back to
 * {@link definitionKeyInId}, which leaves the bare ids' keys null.
 */
export async function resolveDefinitionKeys(
  client: Client,
  definitionIds: Iterable<string | null | undefined>,
): Promise<(definitionId: string) => string | null> {
  for (const id of definitionIds) {
    if (id && definitionKeyInId(id) === null) {
      return definitionKeyResolver(await fetchStatsByKey(client, {}))
    }
  }
  return definitionKeyInId
}
