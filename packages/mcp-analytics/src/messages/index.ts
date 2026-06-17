import { createTranslator, type Catalogs } from "@miragon/mcp-toolkit-core"
import { enSweep } from "./en.sweep.js"
import { deSweep } from "./de.sweep.js"
import { enServer } from "./en.server.js"
import { deServer } from "./de.server.js"

/**
 * The analytics module's message catalogs, keyed by locale. The locale source is
 * the global gateway ProfileGate (`<LocaleProvider>`); `en` is the fallback.
 * Analytics ships only the per-widget sweep catalogs today. Shared by server
 * summaries (`translator(locale, key)`) and widgets (`useT()`).
 */
export const catalogs: Catalogs = {
  en: { ...enSweep, ...enServer },
  de: { ...deSweep, ...deServer },
}

/** Resolve a message for an explicit locale (server side, or direct UI calls). */
export const translator = createTranslator(catalogs)
