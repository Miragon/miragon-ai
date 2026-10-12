import { callerCacheKey } from "@miragon-ai/widget-shell/server"
import type { NameIndex, ProcessNames } from "./bpmn-names.js"

/**
 * Engine-agnostic BPMN-XML lookup injected by the host app (which owns the
 * engine clients) — this module never talks to an engine itself. Resolves the
 * diagram XML of a process definition key's latest deployed version on the
 * engine `engineId` names (omitted: the host's default engine). `null` is an
 * answer: that engine has no such definition. A read that failed
 * (unreachable, refused, timed out) REJECTS, so a consumer tells "not there"
 * from "not now" and never remembers a failure as an answer.
 */
export type FetchBpmnXml = (
  processDefinitionKey: string,
  engineId?: string,
) => Promise<string | null>

/** What one view asks the lookup for, besides its keys. */
export interface NameRequest {
  /** Per key, the elements whose names the view shows; a key left out gets every named element. */
  elementIds?: Readonly<Record<string, readonly string[]>>
  /**
   * Per key, the engines it runs on, in the order to read them (the
   * landscape knows them per process). Preferred over {@link NameRequest.engines}.
   */
  enginesByKey?: Readonly<Record<string, readonly string[]>>
  /**
   * The view's engines, in the order to read them, for a key without a list
   * of its own: the first whose model has the key names it. None: the host's
   * default engine.
   */
  engines?: readonly string[] | null
}

/**
 * Names for the process keys of one view: a {@link NameIndex} holding the keys
 * whose model could be read on one of their engines, each with the elements
 * the request asks for.
 */
export type NameLookup = (keys: Iterable<string>, request?: NameRequest) => Promise<NameIndex>

/** A lookup that knows no names: what a server without the camunda7 module has. */
export const NO_NAMES: NameLookup = () => Promise.resolve({})

export interface NameLookupOptions {
  /**
   * How long one view waits for its names (ms), over every key and engine.
   * Names are enrichment: a slow engine must not hold up the figures. A read
   * still running then finishes for the next view.
   */
  timeoutMs?: number
  /** How long an engine's answer is reused (ms): diagrams change with a deployment, not per call. */
  ttlMs?: number
  /** The most keys one view looks up, in the order it names them; the rest show their ids. */
  maxKeys?: number
  /** The most answers kept; the oldest go first. */
  maxEntries?: number
  /**
   * Whose engine permissions a read runs under: the partition of the cache,
   * so one caller's answer never serves another. Default: the request's
   * caller and credential (`callerCacheKey`, widget-shell). With passthrough
   * auth every engine read carries the caller's own token and the engine
   * answers with THAT caller's permissions: a model one caller may read must
   * never reach another through the cache, and a caller the engine refused
   * must not hide the names from everyone else.
   */
  caller?: () => string
  /** Clock, for tests. */
  now?: () => number
}

const DEFAULT_TIMEOUT_MS = 2_000
const DEFAULT_TTL_MS = 5 * 60_000
const DEFAULT_MAX_KEYS = 40
const DEFAULT_MAX_ENTRIES = 2_000

/** One engine's answer: the names, `null` for "no such model", `undefined` for a failed read. */
type Answer = ProcessNames | null | undefined

/**
 * The view's name lookup over the injected BPMN lookup, or {@link NO_NAMES}
 * without one. Reads a key's model on its engines in order until one has it.
 * Each engine's answer is kept per caller for `ttlMs` (a "no such model"
 * too: a key an engine does not know stays unknown there that long); a failed
 * read is not kept, so the next view asks again. Never waits longer than
 * `timeoutMs` and never fails: a key without an answer is left out, and the
 * view shows its id.
 */
export function createNameLookup(
  fetchBpmnXml: FetchBpmnXml | undefined,
  options: NameLookupOptions = {},
): NameLookup {
  if (!fetchBpmnXml) return NO_NAMES
  const fetchXml = fetchBpmnXml
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const now = options.now ?? Date.now
  const callerOf = options.caller ?? callerCacheKey
  /** (caller, engine, key) → that engine's answer for that caller, oldest first. */
  const cache = new Map<string, { at: number; names: ProcessNames | null }>()

  function remember(id: string, names: ProcessNames | null): void {
    // Re-inserted at the end, so the map stays oldest first.
    cache.delete(id)
    cache.set(id, { at: now(), names })
    for (const oldest of cache.keys()) {
      if (cache.size <= maxEntries) break
      cache.delete(oldest)
    }
  }

  function readOn(caller: string, engine: string | undefined, key: string): Promise<Answer> {
    const id = JSON.stringify([caller, engine ?? null, key])
    const hit = cache.get(id)
    if (hit && now() - hit.at < ttlMs) return Promise.resolve(hit.names)
    return Promise.resolve()
      .then(() => fetchXml(key, engine))
      .then(
        (xml) => {
          const names = xml ? parseBpmnNames(xml, key) : null
          remember(id, names)
          return names
        },
        // A failed read is no answer: not kept, the next view asks again.
        () => undefined,
      )
  }

  return async (keys, request = {}) => {
    const caller = callerOf()
    const unique = [...new Set(keys)].filter((key) => key.length > 0).slice(0, maxKeys)
    const deadline = startDeadline(timeoutMs)

    async function namesOf(key: string): Promise<ProcessNames | null> {
      for (const engine of enginesFor(key, request)) {
        const names = await Promise.race([readOn(caller, engine, key), deadline.passed])
        if (names) return names
        if (deadline.expired()) break
      }
      return null
    }

    try {
      const reads = await Promise.all(unique.map(async (key) => [key, await namesOf(key)] as const))
      const index: NameIndex = {}
      for (const [key, names] of reads) {
        if (!names) continue
        const wanted = own(request.elementIds, key)
        index[key] = {
          name: names.name,
          elements: wanted ? pick(names.elements, wanted) : names.elements,
        }
      }
      return index
    } finally {
      deadline.clear()
    }
  }
}

/** `record[key]` when the record itself holds it: a key such as `constructor` is no inherited lookup. */
function own<T>(record: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined
}

/** The engines to read `key`'s model on, in order: its own, else the view's, else the default engine. */
function enginesFor(key: string, request: NameRequest): ReadonlyArray<string | undefined> {
  const mine = own(request.enginesByKey, key)
  if (mine && mine.length > 0) return mine
  if (request.engines && request.engines.length > 0) return request.engines
  return [undefined]
}

/** The entries of `elements` named in `ids` (what the view shows, nothing else). */
function pick(elements: Record<string, string>, ids: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const id of ids) if (Object.hasOwn(elements, id)) out[id] = elements[id]
  return out
}

/**
 * One view's time budget: `passed` resolves `undefined` once `ms` passed, and
 * `clear` stops the timer, so a fast view leaves nothing pending.
 */
function startDeadline(ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let expired = false
  const passed = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      expired = true
      resolve(undefined)
    }, ms)
  })
  return { passed, expired: () => expired, clear: () => clearTimeout(timer) }
}

/** A start tag: prefix, local name, and its attributes (a quoted value may hold `>`). */
const START_TAG =
  /<(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)((?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?>/g
const ATTRIBUTE = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }

/** A numeric character reference's character; one past Unicode stays as written. */
const character = (code: number, written: string) =>
  code <= 0x10ffff ? String.fromCodePoint(code) : written

/** An attribute value as text: entities decoded, line breaks and runs of space folded. */
function attributeText(raw: string): string {
  return raw
    .replace(
      /&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi,
      (match: string, hex?: string, dec?: string, named?: string) => {
        if (hex) return character(Number.parseInt(hex, 16), match)
        if (dec) return character(Number.parseInt(dec, 10), match)
        return ENTITIES[(named ?? "").toLowerCase()] ?? match
      },
    )
    .replace(/\s+/g, " ")
    .trim()
}

function attributesOf(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of raw.matchAll(ATTRIBUTE)) out[m[1]] = m[2] ?? m[3] ?? ""
  return out
}

/**
 * The names in one BPMN 2.0 XML document, read without a DOM (the server has
 * none): the `<process id=key name=…>` (or, when the process has no name, the
 * name of the pool — `<participant processRef=key>` — that holds it) and every
 * element with an `id` and a non-empty `name`. Comments and CDATA are skipped,
 * any namespace prefix is accepted. A document that is not BPMN yields no
 * names, never an error. The heatmap's header names a process by the same
 * rule in the browser (`bpmnProcessName`, widget-shell).
 */
export function parseBpmnNames(xml: string, processDefinitionKey: string): ProcessNames {
  const text = xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, "")
  let processName: string | null = null
  let poolName: string | null = null
  const elements: Record<string, string> = {}
  for (const m of text.matchAll(START_TAG)) {
    const local = m[1]
    const attrs = attributesOf(m[2] ?? "")
    const name = attrs.name === undefined ? "" : attributeText(attrs.name)
    if (local === "participant") {
      if (attrs.processRef === processDefinitionKey && name) poolName = name
      continue
    }
    if (!attrs.id || !name) continue
    if (local === "process") {
      if (attrs.id === processDefinitionKey) processName = name
      continue
    }
    elements[attrs.id] = name
  }
  return { name: processName ?? poolName, elements }
}
