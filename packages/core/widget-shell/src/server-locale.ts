import { resolveProfileKey } from "./profile.js"
import type { ProfileSource } from "./profile.js"
import { readProfileAdvisory } from "./profile-advisory.js"
import { explicitLocale } from "./profile-constants.js"

/** A locale-bound translate for server summaries: `t(key, params?) => string`. */
export type ServerT = (key: string, params?: Record<string, unknown>) => string

/** The shape of the toolkit's `createTranslator(catalogs)` result. */
export type Translator = (locale: string, key: string, params?: Record<string, unknown>) => string

/**
 * Resolve the active locale for the in-flight request from the user profile
 * (`resolveProfileKey` → `language`), falling back to English — also for the
 * `system` preference: the host locale it follows is a widget-side signal
 * (`hostContext.locale`) the server never sees. Pass the
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
  return (
    explicitLocale((await readProfileAdvisory(store, resolveProfileKey(ctx)))?.language) ?? "en"
  )
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

/** What a show tool needs to word its result: the model summary and the view title. */
export interface ViewLocale {
  /** Model summaries: the profile language, English for "system" ({@link createLocalizeFor}). */
  t: ServerT
  /**
   * The view's title (the host toolbar) in the profile language, or
   * undefined when the profile says "system": the server never sees the
   * host's locale, so it sets no title rather than an English one over a
   * German view, and the widget's own heading names the view in the host's
   * language (#322 U3).
   */
  title: (key: string, params?: Record<string, unknown>) => string | undefined
}

/**
 * Bind a module's translator to the ONE view-title rule every show tool of
 * every module follows: `export const viewLocaleOf = createViewLocaleOf(translator)`,
 * for a handler that already holds the caller's profile language (a settings
 * view reads the whole record anyway).
 */
export function createViewLocaleOf(
  translator: Translator,
): (language: string | undefined) => ViewLocale {
  return (language) => {
    const named = explicitLocale(language)
    const t: ServerT = (key, params) => translator(named ?? "en", key, params)
    return { t, title: (key, params) => (named ? t(key, params) : undefined) }
  }
}

/**
 * `createLocalizeFor` plus the view title, from ONE profile read: a show tool
 * words its result with
 * `const { t, title } = await localizeViewFor(store, ctx)`, then
 * `title: title("key"), summary: t("key", { … })`.
 * Fail-soft like it: no store, no caller or a store outage reads as "system"
 * (no title, an English summary).
 */
export function createLocalizeViewFor(
  translator: Translator,
): (store?: ProfileSource, ctx?: unknown) => Promise<ViewLocale> {
  const viewLocaleOf = createViewLocaleOf(translator)
  return async (store, ctx) => {
    const record = store ? await readProfileAdvisory(store, resolveProfileKey(ctx)) : undefined
    return viewLocaleOf(record?.language)
  }
}
