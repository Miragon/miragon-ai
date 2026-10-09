import { resolveProfileKey } from "./profile.js"
import type { ProfileSource } from "./profile.js"
import { readProfileAdvisory } from "./profile-advisory.js"

/** A locale-bound translate for server summaries: `t(key, params?) => string`. */
export type ServerT = (key: string, params?: Record<string, unknown>) => string

/** The shape of the toolkit's `createTranslator(catalogs)` result. */
export type Translator = (locale: string, key: string, params?: Record<string, unknown>) => string

/**
 * Resolve the active locale for the in-flight request from the user profile
 * (`resolveProfileKey` → `language`), falling back to English. Pass the
 * tool-handler `ctx` so the lookup resolves the caller exactly like the save
 * path (`resolveProfileKey`: the OAuth caller from `ctx`) — without it, only
 * the ambient request info can name the caller.
 *
 * Fail-soft on every axis — no store, no key, or a store OUTAGE: with
 * `DATABASE_URL` the store is a network call, and this runs as the first
 * `await` of many widget tools — a Postgres hiccup must degrade the summary to
 * English, never fail a tool whose data comes from the engine/Prometheus.
 */
export async function resolveProfileLocale(
  store: ProfileSource | undefined,
  ctx?: unknown,
): Promise<string> {
  if (!store) return "en"
  return (await readProfileAdvisory(store, resolveProfileKey(ctx)))?.language ?? "en"
}

/**
 * Bind a module's translator to the per-request locale resolution: the module
 * creates its `localizeFor` once —
 * `export const localizeFor = createLocalizeFor(translator)` — and tool
 * handlers localize their model-facing summaries with
 * `const t = await localizeFor(store, ctx); … summary: t("key", { … })`.
 */
export function createLocalizeFor(
  translator: Translator,
): (store?: ProfileSource, ctx?: unknown) => Promise<ServerT> {
  return async (store, ctx) => {
    const locale = await resolveProfileLocale(store, ctx)
    return (key, params) => translator(locale, key, params)
  }
}
