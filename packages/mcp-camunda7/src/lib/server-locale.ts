import type { ProfileStore } from "./profile-store.js"
import { resolveProfileKey } from "./resolve-profile-key.js"
import { translator } from "../messages/index.js"

/**
 * Resolve the active locale for the in-flight request from the user profile
 * (`resolveProfileKey` → `ProfileStore.language`). Falls back to English when no
 * session/profile is resolvable. Server-side (uses the request context).
 */
export async function resolveLocale(store: ProfileStore): Promise<string> {
  const key = resolveProfileKey()
  if (!key) return "en"
  return (await store.get(key))?.language ?? "en"
}

/** A locale-bound translate for server summaries: `t(key, params?) => string`. */
export type ServerT = (key: string, params?: Record<string, unknown>) => string

/**
 * Resolve the request locale and return a translate bound to it + the camunda7
 * catalogs — so a tool handler localizes its model-facing summary with
 * `const t = await localizeFor(store); … summary: t("key", { … })`.
 */
export async function localizeFor(store: ProfileStore): Promise<ServerT> {
  const locale = await resolveLocale(store)
  return (key, params) => translator(locale, key, params)
}
