/**
 * A record key as a header people read, in sentence case: camelCase,
 * snake_case and kebab-case split into words, the words lower case, the
 * first letter capital, acronyms kept — `totalIncidents` → "Total
 * incidents", `process_definition_key` → "Process definition key",
 * `processURLKey` → "Process URL key". A key that already reads as words
 * stays as written ("Offene Incidents" keeps its German capitals); one
 * without any letter or digit stays as it is.
 */
export function humanizeKey(key: string): string {
  if (/\S\s+\S/.test(key)) return key.trim()
  const words = key
    // camelCase: "totalIncidents" → "total Incidents"
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    // an acronym before a word: "URLKey" → "URL Key"
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter((word) => word.length > 0)
    .map((word) => (/^[A-Z][A-Z\d]+$/.test(word) ? word : word.toLowerCase()))
  if (words.length === 0) return key
  const sentence = words.join(" ")
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}
