import { useMemo } from "react"
import { useLocale } from "@miragon/mcp-toolkit-ui"
import { translator } from "./index.js"

/** A locale-bound translate for widgets: `t(key, params?) => string`. */
export type T = (key: string, params?: Record<string, unknown>) => string

/**
 * Widget-side translate bound to the active locale (from the nearest
 * `<LocaleProvider>`, provided globally by the gateway's ProfileGate) and the
 * camunda7 catalogs. Kept separate from `messages/index.ts` so the server can
 * import `translator` without pulling `@miragon/mcp-toolkit-ui` (React) into the
 * Node graph.
 *
 * @example
 * const t = useT()
 * <h2>{t("engineHealth.title")}</h2>
 */
export function useT(): T {
  const locale = useLocale()
  return useMemo<T>(() => (key, params) => translator(locale, key, params), [locale])
}
