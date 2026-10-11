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
 *
 * Formal address counts at the start of an entry and of a sentence too, which
 * is exactly where a UI catalog puts it ("Ihre Sitzung ist abgelaufen.").
 * The rare sentence-initial she/it/its that reads the same ("Ihre Variablen
 * bleiben erhalten" about an instance) takes an `allow` entry with a reason.
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
  | "unused-allowance"

export interface CatalogTextFinding {
  key: string
  rule: CatalogRule
  text: string
}

/** One accepted finding: the entry's dotted key, the rule, and why it is fine there. */
export interface CatalogAllowance {
  key: string
  rule: CatalogRule
  /** Required: why this entry may break the rule (e.g. "Ihre = the instance's"). */
  reason: string
}

export interface CatalogTextOptions {
  language: CatalogLanguage
  /**
   * Parameters for function entries that need real shapes (an array, an
   * object) instead of the default "every parameter is the number n".
   */
  params?: Readonly<Record<string, unknown>>
  /**
   * Findings a reviewer accepted, each with its reason. A shrink-only list:
   * an allowance that no longer matches a finding comes back as
   * `unused-allowance`, so a fixed entry drops off it.
   */
  allow?: readonly CatalogAllowance[]
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

/** Whether a match opens the entry or a sentence (quotes and markup before it skipped). */
function atSentenceStart(text: string, pos: number): boolean {
  const before = text.slice(0, pos).replace(/[\s*_([„"'«]+$/u, "")
  return before === "" || /[.!?:…\n]$/.test(before)
}

/** A plural, i.e. formal, verb form right after "Sie": haben, können, sind, ändern, tun … */
const PLURAL_VERB = /^\s+(?:sind|tun|[a-zäöüß]+(?:en|eln|ern))(?![\p{L}\p{N}_])/u

/** The team's "ihr" (brand-tone allows it): the ihr-form of a verb follows (habt, könnt, seid). */
const IHR_VERB = /^\s+(?:seid|[a-zäöüß]+t)(?![\p{L}\p{N}_])/u

/**
 * Whether a Sie/Ihr/Ihnen match addresses the reader. Mid-sentence the
 * capital says so. At the start of an entry or a sentence, "Ihnen" and
 * "Ihre/Ihren/Ihrem/Ihrer/Ihres" count as address, "Sie" when a plural verb
 * follows ("Sie haben", not "Sie ist") and "Ihr" unless the ihr-form of a
 * verb follows ("Ihr Team", not "Ihr könnt").
 */
function isFormalAddress(text: string, match: RegExpExecArray): boolean {
  if (!atSentenceStart(text, match.index)) return true
  const rest = text.slice(match.index + match[0].length)
  if (match[0] === "Sie") return PLURAL_VERB.test(rest)
  if (match[0] === "Ihr") return !IHR_VERB.test(rest)
  return true
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
    language === "de" && [...text.matchAll(SIE)].some((m) => isFormalAddress(text, m))
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

/** Every rule violation of a (nested) catalog, keys dotted from `prefix`. */
function walk(catalog: object, options: CatalogTextOptions, prefix: string): CatalogTextFinding[] {
  return Object.entries(catalog as Record<string, unknown>).flatMap(([name, value]) => {
    const key = prefix + name
    if (value !== null && typeof value === "object") return walk(value, options, `${key}.`)
    return entryFindings(key, value, options)
  })
}

const allows = (allowance: CatalogAllowance, finding: CatalogTextFinding) =>
  allowance.key === finding.key && allowance.rule === finding.rule

/**
 * Every rule violation in a catalog. Nested objects are walked with dotted
 * keys; non-string, non-function leaves are ignored. A finding listed in
 * `options.allow` is dropped, an allowance that matches nothing comes back as
 * `unused-allowance`, and an allowance without a reason throws.
 */
export function catalogTextFindings(
  catalog: object,
  options: CatalogTextOptions,
): CatalogTextFinding[] {
  const allow = options.allow ?? []
  for (const allowance of allow) {
    if (!allowance.reason.trim()) {
      throw new Error(`The allowance for ${allowance.key} (${allowance.rule}) needs a reason`)
    }
  }
  const findings = walk(catalog, options, "")
  const unused = allow.filter((allowance) => !findings.some((f) => allows(allowance, f)))
  return [
    ...findings.filter((f) => !allow.some((allowance) => allows(allowance, f))),
    ...unused.map((allowance) => ({
      key: allowance.key,
      rule: "unused-allowance" as const,
      text: `${allowance.rule}: ${allowance.reason}`,
    })),
  ]
}
