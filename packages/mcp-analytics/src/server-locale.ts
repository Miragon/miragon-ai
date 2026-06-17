import { getRequestContext } from "mcp-use/server"
import { translator } from "./messages/index.js"

/**
 * Minimal structural view of the gateway's profile store — just enough to read
 * the active locale. The camunda7 `ProfileStore` satisfies this without
 * analytics depending on the camunda7 module.
 */
export interface LocaleSource {
  get(key: string): Promise<{ language?: string } | undefined>
}

/** Read the MCP session id off the request context (mcp-use AsyncLocalStorage). */
function sessionId(): string | undefined {
  const ctx = getRequestContext()
  if (!ctx) return undefined
  return ctx.req.header("Mcp-Session-Id") ?? ctx.req.header("mcp-session-id") ?? undefined
}

/** Resolve the active locale from the profile store, falling back to English. */
async function resolveLocale(store?: LocaleSource): Promise<string> {
  if (!store) return "en"
  const key = sessionId()
  if (!key) return "en"
  return (await store.get(key))?.language ?? "en"
}

/** A locale-bound translate for analytics server summaries. */
export type ServerT = (key: string, params?: Record<string, unknown>) => string

/**
 * Resolve the request locale and return a translate bound to it + the analytics
 * catalogs — `const t = await localizeFor(store); … summary: t("key", { … })`.
 */
export async function localizeFor(store?: LocaleSource): Promise<ServerT> {
  const locale = await resolveLocale(store)
  return (key, params) => translator(locale, key, params)
}
