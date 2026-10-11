import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { MessageCatalog } from "@miragon/mcp-toolkit-core"
import { deAskAi } from "./de.ask-ai.js"
import { deServer } from "./de.server.js"
import { deSweep } from "./de.sweep.js"
import { enAskAi } from "./en.ask-ai.js"
import { enServer } from "./en.server.js"
import { enSweep } from "./en.sweep.js"
import { GLOSSARY } from "./glossary.js"

/**
 * One term, one word (GLOSSARY.md): no catalog uses a synonym the glossary
 * rules out — "Incident", never "Vorfall"; "Jobs ohne Versuche", never "tote
 * Jobs"; "nicht belastbar", never "unzureichendes Signal". A counted entry is
 * rendered with 1 and 2, so both forms are checked.
 */

/** Every entry as text: strings as they are, counted entries for 1 and for 2. */
function texts(catalog: MessageCatalog): [key: string, text: string][] {
  return Object.entries(catalog).flatMap(([key, message]): [string, string][] => {
    if (typeof message === "string") return [[key, message]]
    // Every parameter is the count n.
    const params = (n: number): Record<string, unknown> => new Proxy({}, { get: () => n })
    return [
      [key, message(params(1))],
      [key, message(params(2))],
    ]
  })
}

const CATALOGS = {
  de: { ui: [deSweep, deAskAi], model: [deServer] },
  en: { ui: [enSweep, enAskAi], model: [enServer] },
} as const

function offenders(language: "de" | "en"): string[] {
  const found: string[] = []
  for (const term of GLOSSARY) {
    const avoid = language === "de" ? term.avoidDe : term.avoidEn
    const catalogs =
      term.scope === "ui"
        ? CATALOGS[language].ui
        : [...CATALOGS[language].ui, ...CATALOGS[language].model]
    for (const catalog of catalogs) {
      for (const [key, text] of texts(catalog)) {
        for (const pattern of avoid) {
          const hit = pattern.exec(text)
          if (hit) found.push(`${key}: "${hit[0]}" instead of "${term[language]}"`)
        }
      }
    }
  }
  return found
}

describe("the catalogs use the glossary's words", () => {
  it.each(["de", "en"] as const)("%s: no synonym the glossary rules out", (language) => {
    expect(offenders(language)).toEqual([])
  })

  it("names every term in GLOSSARY.md, so the document and the check cannot drift", () => {
    const doc = readFileSync(new URL("./GLOSSARY.md", import.meta.url), "utf8")
    for (const term of GLOSSARY) {
      expect(doc, term.de).toContain(term.de)
      expect(doc, term.en).toContain(term.en)
    }
  })

  it("catches a ruled-out synonym (the check is not decoration)", () => {
    const incident = GLOSSARY.find((term) => term.de === "Incident")!
    expect(incident.avoidDe.some((p) => p.test("Offene Vorfälle"))).toBe(true)
    expect(incident.avoidDe.some((p) => p.test("Vorfallsrate"))).toBe(true)
    const running = GLOSSARY.find((term) => term.de === "laufend")!
    expect(running.avoidDe.some((p) => p.test("Aktiv"))).toBe(true)
    expect(running.avoidDe.some((p) => p.test("Aktivität"))).toBe(false)
  })
})

describe("every hand-off label says it goes to the chat", () => {
  const HAND_OFF_LABEL = /\.(analyzeLabel|askLabel|compareLabel)$/
  it.each([
    ["de", deSweep],
    ["en", enSweep],
  ] as const)("%s", (_language, catalog) => {
    const labels = texts(catalog).filter(([key]) => HAND_OFF_LABEL.test(key))
    expect(labels.length).toBeGreaterThanOrEqual(6)
    for (const [key, text] of labels) expect(text, key).toMatch(/chat/i)
  })
})

describe("the German and English catalogs carry the same keys", () => {
  it("sweep and server", () => {
    expect(Object.keys(deSweep).sort()).toEqual(Object.keys(enSweep).sort())
    expect(Object.keys(deServer).sort()).toEqual(Object.keys(enServer).sort())
  })
})
