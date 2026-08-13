import { useMemo } from "react"
import { useLocale } from "@miragon/mcp-toolkit-ui"
import { translator } from "./index.js"

/** A locale-bound translate for analytics widgets: `t(key, params?) => string`. */
export type T = (key: string, params?: Record<string, unknown>) => string

/**
 * Analytics-side translate bound to the active locale (from the global server
 * `<LocaleProvider>`) and the analytics catalogs. Mirrors the camunda7 module's
 * `useT`; the two modules keep separate catalogs but share the one locale.
 */
export function useT(): T {
  const locale = useLocale()
  return useMemo<T>(() => (key, params) => translator(locale, key, params), [locale])
}
