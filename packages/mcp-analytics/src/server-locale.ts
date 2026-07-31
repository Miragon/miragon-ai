import { getRequestContext } from "mcp-use/server"
import { translator } from "./messages/index.js"

/**
 * Minimal structural view of the server app's profile store — the locale plus
 * this module's own settings slice under `modules.analytics`, and (when the
 * host wires a writable store) the save half for the analytics settings tool.
 * The camunda7 `ProfileStore` satisfies this without analytics depending on
 * the camunda7 module; `save` merges per module key on the store side, so
 * writing `modules.analytics` never touches other modules' slices.
 */
export interface ProfileSource {
  get(key: string): Promise<ProfileSlice | undefined>
  save?(
    key: string,
    input: { modules: Record<string, unknown> },
    opts?: { userId?: string },
  ): Promise<ProfileSlice>
}

/** The slice of the shared profile record this module reads. */
export interface ProfileSlice {
  language?: string
  modules?: Record<string, unknown>
}

/**
 * Resolve the profile key for the in-flight request — deliberately the same
 * precedence as camunda7's `resolveProfileKey` (module peers can't share the
 * code): the authenticated user id (off the tool-handler `ctx`, or off the
 * request context's `auth` variable for handlers without a `ctx`), else the
 * MCP session id (`Mcp-Session-Id` header via the mcp-use request context),
 * else the shared `"anonymous"` record when there is NO request context at all
 * (stdio, tests). An HTTP request without a session id resolves `undefined` —
 * reads fall back to defaults, saves fail visibly, so unrelated keyless
 * clients never cross-share one record.
 */
export function resolveSettingsKey(ctx?: unknown): string | undefined {
  const userId = resolveSettingsAuthUserId(ctx)
  if (userId) return userId

  const reqCtx = getRequestContext()
  if (!reqCtx) return "anonymous"

  return reqCtx.req.header("Mcp-Session-Id") ?? reqCtx.req.header("mcp-session-id") ?? undefined
}

/**
 * Just the authenticated-user half of {@link resolveSettingsKey} — the save
 * path stamps it onto the record (`opts.userId`), marking it user-bound and
 * exempt from the app's session-TTL cleanup. Mirrors camunda7's
 * `resolveAuthUserId` (module peers can't share the code).
 */
export function resolveSettingsAuthUserId(ctx?: unknown): string | undefined {
  type AuthSlice = { user?: { userId?: unknown } } | undefined
  const ctxUserId = (ctx as { auth?: AuthSlice } | undefined)?.auth?.user?.userId
  if (typeof ctxUserId === "string" && ctxUserId.length > 0) return ctxUserId

  const reqCtx = getRequestContext()
  if (!reqCtx) return undefined
  try {
    const auth = (reqCtx as { get(key: string): unknown }).get("auth") as AuthSlice
    const userId = auth?.user?.userId
    if (typeof userId === "string" && userId.length > 0) return userId
  } catch {
    // Context-variable access is best-effort.
  }
  return undefined
}

/**
 * Resolve the active locale from the profile store, falling back to English.
 * Fail-soft on every axis — no store, no key, or a store OUTAGE — for the same
 * reason `settingsFor` is: a profile-store hiccup must never fail an analytics
 * read that only needs Prometheus.
 */
async function resolveLocale(store?: ProfileSource, ctx?: unknown): Promise<string> {
  if (!store) return "en"
  const key = resolveSettingsKey(ctx)
  if (!key) return "en"
  try {
    return (await store.get(key))?.language ?? "en"
  } catch {
    return "en"
  }
}

/** A locale-bound translate for analytics server summaries. */
export type ServerT = (key: string, params?: Record<string, unknown>) => string

/**
 * Resolve the request locale and return a translate bound to it + the analytics
 * catalogs — `const t = await localizeFor(store, ctx); … summary: t("key", { … })`.
 * Pass the tool-handler `ctx` so an auth user id resolves the same record the
 * save path writes.
 */
export async function localizeFor(store?: ProfileSource, ctx?: unknown): Promise<ServerT> {
  const locale = await resolveLocale(store, ctx)
  return (key, params) => translator(locale, key, params)
}
