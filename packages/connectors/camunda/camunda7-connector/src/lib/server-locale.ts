import { createLocalizeFor, resolveProfileLocale } from "@miragon-ai/widget-shell/server"
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
