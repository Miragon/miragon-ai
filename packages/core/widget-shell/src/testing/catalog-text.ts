/**
 * The catalog text test: the machine-checkable rules of the Miragon voice
 * (brand-tone; brand-review A1, A2, A10) applied to a message catalog. brand-
 * lint reads Markdown, not strings inside `.ts` modules, so every catalog
 * runs this in its own test:
 *
 *   expect(catalogTextFindings(de, { language: "de" })).toEqual([])
 *
 * German follows brand-tone fully (du, AI, CIB seven, no dash connector);
 * English takes the transferable rules. Function entries are rendered with
 * every parameter set to 1 (and 2), so a "1 incidents" surfaces.
 */

export type CatalogLanguage = "de" | "en"

export type CatalogRule =
  | "dash-connector"
  | "ki"
  | "cib-seven"
  | "formal-address"
  | "impersonal-man"
  | "plural"
  | "render-error"

export interface CatalogTextFinding {
  key: string
  rule: CatalogRule
  text: string
}

export interface CatalogTextOptions {
  language: CatalogLanguage
  /**
   * Parameters for function entries that need real shapes (an array, an
   * object) instead of the default "every parameter is the number n".
   */
  params?: Readonly<Record<string, unknown>>
}

/** A stand-in parameter object: every property and its own primitive value is `n`. */
function sampleParams(n: number): unknown {
  return new Proxy(Object.create(null) as object, {
    get: (_target, prop) => {
      if (prop === Symbol.toPrimitive) return (hint: string) => (hint === "number" ? n : String(n))
      if (prop === "toString" || prop === "valueOf") return () => String(n)
      return n
    },
  })
}

/** Render one entry: strings as they are (`{param}` → n), functions called with sample params. */
function render(value: unknown, n: number, params: unknown): string | undefined {
  if (typeof value === "string") return value.replace(/\{\w+\}/g, String(n))
  if (typeof value === "function") {
    const out: unknown = (value as (p: unknown) => unknown)(params ?? sampleParams(n))
    return typeof out === "string" ? out : undefined
  }
  return undefined
}

const SIE = /(?<![\p{L}\p{N}_])(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?![\p{L}\p{N}_])/gu

/** brand-lint's rule: at a sentence start „Sie"/„Ihr" is ambiguous (they / her) and skipped. */
function atSentenceStart(text: string, pos: number): boolean {
  const before = text.slice(0, pos).replace(/[\s*_([„"'«]+$/u, "")
  return before === "" || /[.!?:…\n]$/.test(before)
}

/** English: "1 incidents", "1 engines" (a plural noun right after the number one). */
const EN_PLURAL_AFTER_ONE = /(?<![\d.,])\b1\s+([a-z]+s)\b/g
const EN_NOT_PLURAL = /(ss|us|is|ics|news)$|^(has|was|does|its|this|yes|plus|always)$/

/** German: the counted nouns of this product, in their plural form. */
const DE_PLURAL_AFTER_ONE =
  /(?<![\d.,])\b1\s+(Incidents|Instanzen|Engines|Jobs|Prozesse|Prozessdefinitionen|Definitionen|Versionen|Tage|Stunden|Minuten|Sekunden|Wochen|Versuche|Einträge|Aufgaben|Tasks|Variablen|Elemente|Aktivitäten|Umgebungen|Deployments)\b/u

type Check = (text: string, language: CatalogLanguage) => CatalogRule[]

const checks: Check[] = [
  // A2: no em dash as a connector; a bare "—" (the empty-value placeholder) is fine.
  (text) =>
    (text.trim() !== "—" && text.includes("—")) || / –(?=[\s,;.:!?)]|$)/.test(text)
      ? ["dash-connector"]
      : [],
  // A10: AI, never KI; CIB seven, never CIB Seven.
  (text) => (/(?<![\p{L}])KI(?![\p{L}])/u.test(text) ? ["ki"] : []),
  (text) => (/\bCIB[\s-]*(Seven|SEVEN)\b/.test(text) ? ["cib-seven"] : []),
  // A1: du, never Sie; no impersonal "man".
  (text, language) =>
    language === "de" && [...text.matchAll(SIE)].some((m) => !atSentenceStart(text, m.index))
      ? ["formal-address"]
      : [],
  (text, language) =>
    language === "de" && /(?<![\p{L}])[Mm]an(?![\p{L}])/u.test(text) ? ["impersonal-man"] : [],
]

function pluralFindings(one: string, language: CatalogLanguage): boolean {
  if (language === "de") return DE_PLURAL_AFTER_ONE.test(one)
  return [...one.matchAll(EN_PLURAL_AFTER_ONE)].some((m) => !EN_NOT_PLURAL.test(m[1]))
}

function entryFindings(
  key: string,
  value: unknown,
  options: CatalogTextOptions,
): CatalogTextFinding[] {
  let one: string | undefined
  let two: string | undefined
  try {
    one = render(value, 1, options.params?.[key])
    two = render(value, 2, options.params?.[key])
  } catch {
    return [{ key, rule: "render-error", text: "pass params for this entry" }]
  }
  if (one === undefined || two === undefined) return []
  const findings = new Set<CatalogRule>()
  for (const text of [one, two]) {
    for (const rule of checks.flatMap((check) => check(text, options.language))) findings.add(rule)
  }
  if (pluralFindings(one, options.language)) findings.add("plural")
  return [...findings].map((rule) => ({ key, rule, text: one }))
}

/**
 * Every rule violation in a catalog. Nested objects are walked with dotted
 * keys; non-string, non-function leaves are ignored.
 */
export function catalogTextFindings(
  catalog: object,
  options: CatalogTextOptions,
  prefix = "",
): CatalogTextFinding[] {
  return Object.entries(catalog as Record<string, unknown>).flatMap(([name, value]) => {
    const key = prefix + name
    if (value !== null && typeof value === "object") {
      return catalogTextFindings(value, options, `${key}.`)
    }
    return entryFindings(key, value, options)
  })
}
