import { createUseT, type T } from "@miragon-ai/widget-shell/widgets"
import { translator } from "./index.js"

export type { T }

/**
 * Widget-side translate bound to the active locale (from the nearest
 * `<LocaleProvider>`, provided globally by the server's ProfileGate) and the
 * camunda7 catalogs — the shared `createUseT` keeps the locale/memo wiring in
 * one place for every module.
 *
 * @example
 * const t = useT()
 * <h2>{t("engineHealth.title")}</h2>
 */
export const useT = createUseT(translator)
