import type { NameIndex, ProcessNames } from "./bpmn-names.js"

/**
 * Engine-agnostic BPMN-XML lookup injected by the host app (which owns the
 * engine client) — this module never talks to an engine itself. Resolves the
 * latest deployed version's diagram XML for a process definition key, or
 * `null` when unavailable.
 */
export type FetchBpmnXml = (processDefinitionKey: string) => Promise<string | null>

/**
 * Names for the process keys of one view: a {@link NameIndex} holding the keys
 * whose model could be read, each with the elements `elementIds` asks for
 * (every named element when it names none for that key).
 */
export type NameLookup = (
  keys: Iterable<string>,
  elementIds?: Readonly<Record<string, readonly string[]>>,
) => Promise<NameIndex>

/** A lookup that knows no names: what a server without the camunda7 module has. */
export const NO_NAMES: NameLookup = () => Promise.resolve({})

export interface NameLookupOptions {
  /**
   * How long one diagram read may take before the view goes on with the ids
   * (ms). Names are enrichment: a slow engine must not hold up the figures.
   */
  timeoutMs?: number
  /** How long a model's names are reused (ms): diagrams change with a deployment, not per call. */
  ttlMs?: number
  /** The most keys one view looks up; the rest show their ids. */
  maxKeys?: number
  /** Clock, for tests. */
  now?: () => number
}

const DEFAULT_TIMEOUT_MS = 2_000
const DEFAULT_TTL_MS = 5 * 60_000
const DEFAULT_MAX_KEYS = 40

/**
 * The view's name lookup over the injected BPMN lookup, or {@link NO_NAMES}
 * without one. Reads each key's model at most once per `ttlMs` (an empty
 * answer too: a key the engine does not know stays unknown for that long),
 * never waits longer than `timeoutMs` for one, and never fails: a read that
 * errors or times out leaves the key out, so the view shows its id.
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
  const now = options.now ?? Date.now
  const cache = new Map<string, { at: number; names: ProcessNames | null }>()

  async function read(key: string): Promise<ProcessNames | null> {
    const hit = cache.get(key)
    if (hit && now() - hit.at < ttlMs) return hit.names
    const xml = await withTimeout(fetchXml(key), timeoutMs)
    // A timeout or a failed read is not remembered: the next view asks again.
    if (xml === undefined) return null
    const names = xml ? parseBpmnNames(xml, key) : null
    cache.set(key, { at: now(), names })
    return names
  }

  return async (keys, elementIds) => {
    const unique = [...new Set(keys)].filter((key) => key.length > 0).slice(0, maxKeys)
    const reads = await Promise.all(unique.map(async (key) => [key, await read(key)] as const))
    const index: NameIndex = {}
    for (const [key, names] of reads) {
      if (!names) continue
      const wanted = elementIds?.[key]
      index[key] = {
        name: names.name,
        elements: wanted ? pick(names.elements, wanted) : names.elements,
      }
    }
    return index
  }
}

/** The entries of `elements` named in `ids` (what the view shows, nothing else). */
function pick(elements: Record<string, string>, ids: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const id of ids) if (Object.hasOwn(elements, id)) out[id] = elements[id]
  return out
}

/**
 * `promise`'s value, or `undefined` once `ms` passed or when it rejects —
 * the timer is cleared either way, so a fast answer leaves nothing pending.
 */
async function withTimeout(
  promise: Promise<string | null>,
  ms: number,
): Promise<string | null | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms)
  })
  try {
    return await Promise.race([promise.catch(() => undefined), timeout])
  } finally {
    clearTimeout(timer)
  }
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
 * names, never an error.
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
