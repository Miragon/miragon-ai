import { createTranslator, type Catalogs } from "@miragon/mcp-toolkit-core"
import { en } from "./en.js"
import { de } from "./de.js"
import { enSweep } from "./en.sweep.js"
import { deSweep } from "./de.sweep.js"

/**
 * The camunda7 module's message catalogs, keyed by locale. The locale source is
 * the user profile (`resolveProfileKey` → `ProfileStore.language`); `en` is the
 * fallback. The hand-written shell/profile strings (`en`/`de`) are merged with
 * the per-widget sweep catalogs (`enSweep`/`deSweep`); on a key clash the sweep
 * wins (last spread). Shared by server summaries (`translator(locale, key)`) and
 * widgets (`useT()` over the global `<LocaleProvider>`).
 */
export const catalogs: Catalogs = {
  en: { ...en, ...enSweep },
  de: { ...de, ...deSweep },
}

/** Resolve a message for an explicit locale (server side, or direct UI calls). */
export const translator = createTranslator(catalogs)
