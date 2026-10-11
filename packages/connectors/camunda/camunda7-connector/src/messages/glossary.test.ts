import { describe, expect, it } from "vitest"
import type { MessageCatalog } from "@miragon/mcp-toolkit-core"
import { catalogs } from "./index.js"

/**
 * The glossary (GLOSSARY.md) as a gate: one word per thing in every view.
 * Each rule names the synonym the catalogs must not use and the glossary
 * term to write instead. A rule may spare named keys, each with its reason.
 */
interface GlossaryRule {
  /** The forbidden synonym. */
  pattern: RegExp
  /** The glossary term that replaces it. */
  use: string
  /** Keys that may keep the word, each with why. */
  except?: Readonly<Record<string, string>>
}

const DE_RULES: readonly GlossaryRule[] = [
  { pattern: /Vorf[aä]ll/, use: "Incident" },
  { pattern: /(?<![\p{L}])[Aa]n(gehalten|halten)/u, use: "aussetzen, ausgesetzt" },
  { pattern: /pausier/i, use: "aussetzen" },
  { pattern: /(?<![\p{L}])GK(?![\p{L}])/u, use: "Geschäftsschlüssel" },
  { pattern: /Business[ -]?Key/i, use: "Geschäftsschlüssel" },
  { pattern: /[Ww]iederhol/, use: "Versuche, neu versuchen" },
  { pattern: /[Aa]uflös|aufgelöst/, use: "als gelöst markieren" },
  { pattern: /(?<![\p{L}])Behoben(?![\p{L}])/u, use: "Als gelöst markiert" },
  { pattern: /Flotte/, use: "alle Engines, Engine-übergreifend" },
  { pattern: /^Laden…$/, use: "Wird geladen…" },
  { pattern: /(?<![\p{L}])Bearbeiter/u, use: "zugewiesen an" },
  { pattern: /Health-Check/, use: "Zustand prüfen" },
  { pattern: /Triagier/, use: "nach Dringlichkeit ordnen" },
  { pattern: /Diagnostizier/, use: "die Ursache finden" },
  {
    pattern: /(?<![\p{L}])[Aa]ktiv(?![\p{L}])/u,
    use: "läuft (Instanz)",
    except: {
      "processList.statusActive": "a deployed definition is active or suspended, it does not run",
    },
  },
]

const EN_RULES: readonly GlossaryRule[] = [
  { pattern: /\bBK\b/, use: "business key" },
  { pattern: /\b(paus|halt)(e|ed|ing)?\b/i, use: "suspend, suspended" },
  { pattern: /\bfleet\b/i, use: "all engines, cross-engine" },
  { pattern: /^(Resolved|Resolve|Retried|Fix)$/, use: "Marked as resolved / Retry scheduled" },
  { pattern: /\bassignee:/i, use: "assigned to" },
  { pattern: /^Health check$/i, use: "check health" },
]

/**
 * Every entry as text: strings as written, functions rendered with sample
 * params; `{placeholder}` names are code, not copy, and drop out.
 */
function rendered(catalog: MessageCatalog): [key: string, text: string][] {
  const sample = new Proxy(Object.create(null) as object, {
    get: (_target, prop) => (typeof prop === "symbol" ? undefined : 2),
  })
  return Object.entries(catalog).map(([key, value]) => [
    key,
    (typeof value === "string" ? value : value(sample as Record<string, unknown>)).replace(
      /\{\w+\}/g,
      "",
    ),
  ])
}

function violations(catalog: MessageCatalog, rules: readonly GlossaryRule[]): string[] {
  return rendered(catalog).flatMap(([key, text]) =>
    rules
      .filter((rule) => rule.pattern.test(text) && !(rule.except && key in rule.except))
      .map((rule) => `${key}: "${text}" → ${rule.use}`),
  )
}

describe("the camunda7 glossary holds in every view", () => {
  it("German uses the glossary terms, never their synonyms", () => {
    expect(violations(catalogs.de, DE_RULES)).toEqual([])
  })

  it("English uses the glossary terms, never their synonyms", () => {
    expect(violations(catalogs.en, EN_RULES)).toEqual([])
  })

  it("every exception still spares a real use (shrink-only)", () => {
    const unused = [...DE_RULES, ...EN_RULES].flatMap((rule) =>
      Object.keys(rule.except ?? {}).filter((key) => {
        const text = rendered(catalogs.de).find(([k]) => k === key)?.[1]
        return text === undefined || !rule.pattern.test(text)
      }),
    )
    expect(unused).toEqual([])
  })

  it("the gate is not blind: each German rule catches its synonym", () => {
    const probes = [
      "Offene Vorfälle",
      "Instanz angehalten",
      "Pausiert",
      "GK: 42",
      "Business Key",
      "Job wiederholen",
      "Incident auflösen",
      "Behoben",
      "Flotten-Analyse",
      "Laden…",
      "Bearbeiter: demo",
      "Health-Check",
      "Triagiere die Jobs",
      "Diagnostiziere den Fehler",
      "Aktiv",
    ]
    for (const [i, probe] of probes.entries()) {
      expect(DE_RULES[i].pattern.test(probe), probe).toBe(true)
    }
  })
})

/**
 * The wording the owner decided (#322 U5): marking an incident resolved
 * never claims a fix, and a chat hand-off never looks like an engine action.
 */
describe("the decided wording", () => {
  it.each([
    ["incidentDetail.resolved", "Als gelöst markiert", "Marked as resolved"],
    ["procIncTable.resolved", "Als gelöst markiert", "Marked as resolved"],
    ["procIncTable.resolve", "Als gelöst markieren", "Mark as resolved"],
    ["incidentFailure.resolveButton", "Als gelöst markieren", "Mark as resolved"],
    ["confirmDialog.resolveConfirm", "Als gelöst markieren", "Mark as resolved"],
    ["handOff.planFix", "Behebung im Chat planen", "Plan a fix in chat"],
    ["handOff.explainError", "Fehler im Chat erklären", "Explain error in chat"],
    ["handOff.draftTicket", "Ticket im Chat entwerfen", "Draft ticket in chat"],
    ["value.yes", "Ja", "Yes"],
    ["value.no", "Nein", "No"],
  ])("%s", (key, german, english) => {
    expect(catalogs.de[key]).toBe(german)
    expect(catalogs.en[key]).toBe(english)
  })
})
