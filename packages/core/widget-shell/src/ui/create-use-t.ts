import { useMemo } from "react"
import { useLocale } from "@miragon/mcp-toolkit-ui"

/** A locale-bound translate for widgets: `t(key, params?) => string`. */
export type T = (key: string, params?: Record<string, unknown>) => string

/** The shape of the toolkit's `createTranslator(catalogs)` result. */
type Translator = (locale: string, key: string, params?: Record<string, unknown>) => string

/**
 * Build a module's widget-side `useT`, bound to the active locale (from the
 * nearest `<LocaleProvider>`, provided globally by the server's ProfileGate)
 * and the module's own catalogs:
 * `export const useT = createUseT(translator)`. Kept apart from the module's
 * `messages/index.ts` so the server can import `translator` without pulling
 * `@miragon/mcp-toolkit-ui` (React) into the Node graph.
 */
export function createUseT(translator: Translator): () => T {
  return function useT(): T {
    const locale = useLocale()
    return useMemo<T>(() => (key, params) => translator(locale, key, params), [locale])
  }
}
