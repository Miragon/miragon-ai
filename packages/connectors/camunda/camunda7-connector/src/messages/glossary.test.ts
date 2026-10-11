import { describe, expect, it } from "vitest"
import type { MessageCatalog } from "@miragon/mcp-toolkit-core"
import { catalogs } from "./index.js"

/**
 * The glossary (GLOSSARY.md) as a gate: one word per thing in every view.
 * Each rule names the synonym the catalogs must not use, the glossary term
 * to write instead, and a probe the rule must catch (so a broken pattern
 * fails instead of passing everything). A rule may spare named keys, each
 * with its reason.
 */
interface GlossaryRule {
  /** The forbidden synonym. */
  pattern: RegExp
  /** The glossary term that replaces it. */
  use: string
  /** A text with the synonym: the rule is blind if it does not match. */
  probe: string
  /** Keys that may keep the word, each with why. */
  except?: Readonly<Record<string, string>>
}

const DE_RULES: readonly GlossaryRule[] = [
  { pattern: /Vorf[aä]ll/, use: "Incident", probe: "Offene Vorfälle" },
  {
    pattern: /(?<![\p{L}])[Aa]n(gehalten|halten)/u,
    use: "aussetzen, ausgesetzt",
    probe: "Instanz angehalten",
  },
  { pattern: /pausier/i, use: "aussetzen", probe: "Pausiert" },
  { pattern: /[Ff]ortsetz|[Ff]ortgesetzt/, use: "aktivieren", probe: "Instanz fortsetzen" },
  { pattern: /(?<![\p{L}])GK(?![\p{L}])/u, use: "Geschäftsschlüssel", probe: "GK: 42" },
  { pattern: /Business[ -]?Key/i, use: "Geschäftsschlüssel", probe: "Business Key" },
  { pattern: /[Ww]iederhol/, use: "Versuche, neu versuchen", probe: "Job wiederholen" },
  { pattern: /[Aa]uflös|aufgelöst/, use: "als gelöst markieren", probe: "Incident auflösen" },
  { pattern: /(?<![\p{L}])Behoben(?![\p{L}])/u, use: "Als gelöst markiert", probe: "Behoben" },
  { pattern: /Flotte/, use: "alle Engines, Engine-übergreifend", probe: "Flotten-Analyse" },
  { pattern: /^Laden…$/, use: "Wird geladen…", probe: "Laden…" },
  { pattern: /(?<![\p{L}])Bearbeiter/u, use: "zugewiesen an", probe: "Bearbeiter: demo" },
  { pattern: /Health-Check/, use: "Zustand prüfen", probe: "Health-Check" },
  { pattern: /Triagier/, use: "nach Dringlichkeit ordnen", probe: "Triagiere die Jobs" },
  { pattern: /Diagnostizier/, use: "die Ursache finden", probe: "Diagnostiziere den Fehler" },
  {
    // The verb only: „Deployment“ stays the engine's noun.
    pattern: /(?<![\p{L}])(ge)?deploy(e|en|st|t|te|ten)?(?![\p{L}])/iu,
    use: "bereitstellen, bereitgestellt",
    probe: "Sobald du ein BPMN-Modell deployst",
  },
  {
    // Inflected forms too: „Aktive Instanzen“, „3 aktive“. „aktivieren“ (an
    // instance that was suspended) and „Aktivität“ stay free.
    pattern: /(?<![\p{L}])[Aa]ktiv(e|em|en|er|es)?(?![\p{L}])/u,
    use: "läuft (Instanz)",
    probe: "Aktive Instanzen",
    except: {
      "processList.statusActive": "a deployed definition is active or suspended, it does not run",
    },
  },
]

const EN_RULES: readonly GlossaryRule[] = [
  { pattern: /\bBK\b/, use: "business key", probe: "BK: 42" },
  { pattern: /\b(paus|halt)(e|ed|ing)?\b/i, use: "suspend, suspended", probe: "Paused" },
  { pattern: /\bresum(e|ed|es|ing)\b/i, use: "activate", probe: "Resume instance" },
  { pattern: /\bfleet\b/i, use: "all engines, cross-engine", probe: "Fleet analysis" },
  {
    pattern: /^(Resolved|Resolve|Retried|Fix)$/,
    use: "Marked as resolved / Retry scheduled",
    probe: "Resolve",
  },
  { pattern: /\bassignee:/i, use: "assigned to", probe: "assignee: demo" },
  { pattern: /^Health check$/i, use: "check health", probe: "Health check" },
  {
    pattern: /\bactive\b/i,
    use: "running (instance)",
    probe: "3 active instances",
    except: {
      "processList.statusActive": "a deployed definition is active or suspended, it does not run",
    },
  },
]

const LANGUAGES = [
  ["German", catalogs.de, DE_RULES],
  ["English", catalogs.en, EN_RULES],
] as const

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

describe.each(LANGUAGES)("the camunda7 glossary holds in %s", (_language, catalog, rules) => {
  it("uses the glossary terms, never their synonyms", () => {
    expect(violations(catalog, rules)).toEqual([])
  })

  it("every exception still spares a real use in this language (shrink-only)", () => {
    const texts = new Map(rendered(catalog))
    const unused = rules.flatMap((rule) =>
      Object.keys(rule.except ?? {}).filter((key) => {
        const text = texts.get(key)
        return text === undefined || !rule.pattern.test(text)
      }),
    )
    expect(unused).toEqual([])
  })

  it("the gate is not blind: each rule catches its probe", () => {
    const blind = rules.filter((rule) => !rule.pattern.test(rule.probe)).map((r) => r.probe)
    expect(blind).toEqual([])
  })
})

describe("the glossary rules spare the glossary terms", () => {
  it.each([
    // aktivieren is the glossary verb for a suspended instance; Aktivität the BPMN element.
    ["Instanz aktivieren", DE_RULES],
    ["Aktivitäten mit Incidents", DE_RULES],
    // Deployment is the engine's noun, not the verb.
    ["Deployment löschen", DE_RULES],
    ["Activate instance", EN_RULES],
    ["Activities with incidents", EN_RULES],
  ])("%s", (text, rules) => {
    expect(rules.filter((rule) => rule.pattern.test(text)).map((r) => r.use)).toEqual([])
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
