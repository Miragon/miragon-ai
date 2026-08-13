import { createUseT, type T } from "@miragon-ai/widget-shell/widgets"
import { translator } from "./index.js"

export type { T }

/**
 * Analytics-side translate bound to the active locale (from the global server
 * `<LocaleProvider>`) and the analytics catalogs — the shared `createUseT`
 * keeps the locale/memo wiring in one place for every module; the modules keep
 * separate catalogs but share the one locale.
 */
export const useT = createUseT(translator)
