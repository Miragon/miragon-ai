/**
 * Plurals for the catalogs (GLOSSARY.md "Texte"). A count reaches a catalog
 * entry either as a number (server summaries) or already formatted by the
 * kit's `formatNumber` (widgets: "1.234" / "1,234"), so "one" is decided on
 * the text: exactly "1". English and German both inflect only for one.
 */
export function isOne(count: unknown): boolean {
  return String(count) === "1"
}

/** The count followed by its noun in the right number: "1 Prozess", "3 Prozesse". */
export function countOf(count: unknown, one: string, other: string): string {
  return `${String(count)} ${isOne(count) ? one : other}`
}
