import {
  createLocalizeFor,
  explicitLocale,
  readProfileAdvisory,
  resolveProfileKey,
  resolveProfileLocale,
} from "@miragon-ai/widget-shell/server"
import type { ProfileSource, ServerT } from "@miragon-ai/widget-shell/server"
import { translator } from "../messages/index.js"

/**
 * The per-request locale resolution + fail-soft rules live in the shared
 * server kit (`resolveProfileLocale`/`createLocalizeFor`) — this file only
 * binds them to THIS module's catalogs. Pass the tool-handler `ctx` so the
 * lookup follows the same key precedence as the save path.
 */
export type { ServerT }

export async function resolveLocale(store: ProfileSource, ctx?: unknown): Promise<string> {
  return resolveProfileLocale(store, ctx)
}

/**
 * Resolve the request locale and return a translate bound to it + the camunda7
 * catalogs — so a tool handler localizes its model-facing summary with
 * `const t = await localizeFor(store, ctx); … summary: t("key", { … })`.
 */
export const localizeFor: (store?: ProfileSource, ctx?: unknown) => Promise<ServerT> =
  createLocalizeFor(translator)

/** What a show tool needs to word its result: the model summary and the view title. */
export interface ViewLocale {
  /** Model-facing summaries — the profile language, English for "system" (as {@link localizeFor}). */
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
 * The {@link ViewLocale} of a profile language the caller already holds (the
 * settings view reads the whole record anyway): the one title rule for every
 * show tool, whether it read the profile itself or through
 * {@link localizeViewFor}.
 */
export function viewLocaleOf(language: string | undefined): ViewLocale {
  const named = explicitLocale(language)
  const t: ServerT = (key, params) => translator(named ?? "en", key, params)
  return { t, title: (key, params) => (named ? t(key, params) : undefined) }
}

/**
 * {@link localizeFor} plus the view title, from ONE profile read. Fail-soft
 * like it: no store, no caller or a store outage reads as "system".
 */
export async function localizeViewFor(store?: ProfileSource, ctx?: unknown): Promise<ViewLocale> {
  const record = store ? await readProfileAdvisory(store, resolveProfileKey(ctx)) : undefined
  return viewLocaleOf(record?.language)
}
