import type { ProfileStore } from "@miragon-ai/widget-shell/server"
import { resolveProfileKey } from "./resolve-profile-key.js"
import { translator } from "../messages/index.js"

/**
 * Resolve the active locale for the in-flight request from the user profile
 * (`resolveProfileKey` → `ProfileStore.language`). Pass the tool-handler `ctx`
 * so the lookup follows the SAME key precedence as the save path (auth user id
 * → session id → stdio-anonymous) — without it, a profile saved under an auth
 * user id would be missed and the summary silently falls back to English.
 *
 * Fail-soft on a store OUTAGE too: with `DATABASE_URL` the store is a network
 * call, and this runs as the first `await` of every widget tool — a Postgres
 * hiccup must degrade the summary to English, never fail a tool whose data
 * comes from the engine.
 */
export async function resolveLocale(store: ProfileStore, ctx?: unknown): Promise<string> {
  const key = resolveProfileKey(ctx)
  if (!key) return "en"
  try {
    return (await store.get(key))?.language ?? "en"
  } catch {
    return "en"
  }
}

/** A locale-bound translate for server summaries: `t(key, params?) => string`. */
export type ServerT = (key: string, params?: Record<string, unknown>) => string

/**
 * Resolve the request locale and return a translate bound to it + the camunda7
 * catalogs — so a tool handler localizes its model-facing summary with
 * `const t = await localizeFor(store, ctx); … summary: t("key", { … })`.
 */
export async function localizeFor(store: ProfileStore, ctx?: unknown): Promise<ServerT> {
  const locale = await resolveLocale(store, ctx)
  return (key, params) => translator(locale, key, params)
}
