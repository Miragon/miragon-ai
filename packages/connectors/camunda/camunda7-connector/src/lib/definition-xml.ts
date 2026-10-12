import type { Client } from "@miragon-ai/camunda7-client"
import { getProcessDefinitionBpmn20Xml } from "@miragon-ai/camunda7-client/sdk"
import { callerCacheKey } from "@miragon-ai/widget-shell/server"

/**
 * How many diagrams one engine client keeps. A deployed definition's XML
 * never changes (a redeploy mints a new id), so an entry never goes stale;
 * the bound only caps memory at a few dozen diagrams of tens of KB.
 */
const XML_CACHE_ENTRIES = 64

/** Per engine client: (caller, definition id) → the read, most recently used last. */
const xmlCache = new WeakMap<Client, Map<string, Promise<string | null>>>()

/**
 * The BPMN 2.0 XML of ONE deployed version, read by its id — the only XML
 * read that finds every definition, tenant deployments included, and the ONE
 * XML read of this module: every view, tool and form check goes through it.
 * Null when the reply carries no XML; a failed read propagates (the caller
 * decides whether the diagram is enrichment) and is not kept, so the next
 * call asks again.
 *
 * Kept per engine client and per CALLER (`callerCacheKey`: the OAuth user and
 * the bearer token the request carries). Under passthrough auth the engine
 * decides per token what a caller may read, so one caller's diagram never
 * answers another's request; concurrent reads of one diagram share one
 * request.
 */
export function fetchDefinitionXml(client: Client, definitionId: string): Promise<string | null> {
  let cache = xmlCache.get(client)
  if (!cache) {
    cache = new Map()
    xmlCache.set(client, cache)
  }
  const id = JSON.stringify([callerCacheKey(), definitionId])
  const hit = cache.get(id)
  if (hit) {
    cache.delete(id)
    cache.set(id, hit)
    return hit
  }
  // Async, so even a synchronous failure arrives as a rejection the callers'
  // enrichment guards (`optional`, `.catch`) see.
  const read = (async () => {
    const reply = await getProcessDefinitionBpmn20Xml({ client, path: { id: definitionId } })
    return (reply as { bpmn20Xml?: string | null } | null)?.bpmn20Xml ?? null
  })()
  cache.set(id, read)
  const entries = cache
  read.catch(() => {
    if (entries.get(id) === read) entries.delete(id)
  })
  for (const oldest of entries.keys()) {
    if (entries.size <= XML_CACHE_ENTRIES) break
    entries.delete(oldest)
  }
  return read
}
