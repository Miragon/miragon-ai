/**
 * The analytics glossary as data: the word the catalogs use per language and
 * the synonyms they never use. `GLOSSARY.md` documents the same terms for
 * people; `glossary.test.ts` holds every catalog to this list and checks that
 * the document names each term. The terms analytics shares with the other
 * modules' views (Incident, Jobs ohne Versuche, bereitstellen,
 * Geschäftsschlüssel, aussetzen, Versuche, alle Engines) are the kit's
 * `PRODUCT_GLOSSARY` (`@miragon-ai/widget-shell/testing`), run by the same test.
 */
export interface GlossaryTerm {
  /** The German word the catalogs use. */
  de: string
  /** The English word the catalogs use. */
  en: string
  /** Synonyms the German catalogs never use. */
  avoidDe: readonly RegExp[]
  /** Synonyms the English catalogs never use. */
  avoidEn: readonly RegExp[]
  /**
   * `ui`: only the widget texts and the Ask-AI intents (what the person
   * reads); the model-facing summaries keep their technical words.
   */
  scope?: "ui"
}

/** A word start: no letter before it (compounds like "Bucketgröße" still match). */
const start = (word: string, flags = "iu") => new RegExp(`(?<!\\p{L})${word}`, flags)
/** A whole word: no letter before or after it ("aktiv", but not "Aktivität"). */
const word = (w: string, flags = "iu") => new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, flags)

export const GLOSSARY: readonly GlossaryTerm[] = [
  { de: "AI", en: "AI", avoidDe: [word("KI", "u")], avoidEn: [] },
  { de: "laufend", en: "running", avoidDe: [word("aktiv(e|en)?")], avoidEn: [word("active")] },
  {
    de: "nicht belastbar",
    en: "not reliable",
    avoidDe: [start("unzureichend"), word("signal")],
    avoidEn: [start("insufficient\\s+signal")],
    scope: "ui",
  },
  {
    de: "Zeitraum",
    en: "period",
    avoidDe: [start("(zeit)?fenster"), start("bucket")],
    avoidEn: [word("windows?"), start("bucket")],
    scope: "ui",
  },
  {
    de: "Kennzahl",
    en: "metric",
    avoidDe: [word("KPIs?", "u")],
    avoidEn: [word("KPIs?", "u")],
    scope: "ui",
  },
  {
    de: "Stand",
    en: "as of",
    avoidDe: [start("snapshot")],
    avoidEn: [start("snapshot")],
    scope: "ui",
  },
]
