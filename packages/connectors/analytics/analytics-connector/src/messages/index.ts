import { createTranslator, type Catalogs } from "@miragon/mcp-toolkit-core"
import { enSweep } from "./en.sweep.js"
import { deSweep } from "./de.sweep.js"
import { enServer } from "./en.server.js"
import { deServer } from "./de.server.js"
import { enAskAi } from "./en.ask-ai.js"
import { deAskAi } from "./de.ask-ai.js"
import { enBuilder } from "./en.builder.js"
import { deBuilder } from "./de.builder.js"

/**
 * The analytics module's message catalogs, keyed by locale. The locale source is
 * the global server ProfileGate (`<LocaleProvider>`); `en` is the fallback.
 * Analytics ships the per-widget sweep catalogs, the server strings and the
 * Ask-AI intents (`askAi.*`) and the view builder's names (`builder.*`). Shared by server summaries
 * (`translator(locale, key)`) and widgets (`useT()`).
 */
export const catalogs: Catalogs = {
  en: { ...enSweep, ...enServer, ...enAskAi, ...enBuilder },
  de: { ...deSweep, ...deServer, ...deAskAi, ...deBuilder },
}

/** Resolve a message for an explicit locale (server side, or direct UI calls). */
export const translator = createTranslator(catalogs)
