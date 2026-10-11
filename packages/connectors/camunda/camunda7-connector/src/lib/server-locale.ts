import {
  createLocalizeFor,
  createLocalizeViewFor,
  createViewLocaleOf,
  resolveProfileLocale,
} from "@miragon-ai/widget-shell/server"
import type { ProfileSource, ServerT, ViewLocale } from "@miragon-ai/widget-shell/server"
import { translator } from "../messages/index.js"

/**
 * The per-request locale resolution, the fail-soft rules and the view-title
 * rule live in the shared server kit (`resolveProfileLocale`,
 * `createLocalizeFor`, `createLocalizeViewFor`), so every module titles its
 * views the same way — this file only binds them to THIS module's catalogs.
 * Pass the tool-handler `ctx` so the lookup follows the same key precedence
 * as the save path.
 */
export type { ServerT, ViewLocale }

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

/**
 * The {@link ViewLocale} of a profile language the caller already holds (the
 * settings view reads the whole record anyway): the one title rule for every
 * show tool, whether it read the profile itself or through
 * {@link localizeViewFor}.
 */
export const viewLocaleOf: (language: string | undefined) => ViewLocale =
  createViewLocaleOf(translator)

/**
 * {@link localizeFor} plus the view title, from ONE profile read: a show tool
 * titles its view only in a language the profile names. Fail-soft like it: no
 * store, no caller or a store outage reads as "system".
 */
export const localizeViewFor: (store?: ProfileSource, ctx?: unknown) => Promise<ViewLocale> =
  createLocalizeViewFor(translator)
