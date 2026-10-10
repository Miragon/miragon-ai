import { describe, expect, it } from "vitest"
import { catalogTextFindings } from "./catalog-text.js"

const rules = (catalog: Record<string, unknown>, language: "de" | "en" = "de") =>
  catalogTextFindings(catalog, { language }).map((f) => `${f.key}:${f.rule}`)

describe("catalogTextFindings — the voice rules over a message catalog", () => {
  it("passes a clean catalog in both languages", () => {
    const de = {
      a: "Die Liste konnte nicht aktualisiert werden. Du siehst das vorherige Ergebnis.",
      b: ({ count }: { count: number }) => `${count} ${count === 1 ? "Incident" : "Incidents"}`,
      c: "1–2 Versuche",
      d: "—",
      e: "Sie ist erledigt.",
      f: "In CIB seven öffnen",
      g: 42,
    }
    const en = {
      a: "Open in CIB seven",
      b: "1 process",
      c: "Status: 1 class",
      d: "{count} of 1 has run",
    }
    expect(rules(de)).toEqual([])
    expect(rules(en, "en")).toEqual([])
  })

  it("flags an em dash as a connector, spaced or glued, and a spaced en dash", () => {
    expect(
      rules(
        {
          spaced: "Fehler — bitte erneut versuchen",
          glued: "Fehler—bitte",
          enSpaced: "Fehler – bitte",
          enEnd: "Fehler –",
          placeholder: " — ",
        },
        "en",
      ),
    ).toEqual([
      "spaced:dash-connector",
      "glued:dash-connector",
      "enSpaced:dash-connector",
      "enEnd:dash-connector",
    ])
  })

  it("flags KI and CIB Seven in both languages", () => {
    expect(
      rules({ ki: "KI-gestützt", ok: "Kiel", cib: "CIB Seven", caps: "CIB SEVEN" }, "en"),
    ).toEqual(["ki:ki", "cib:cib-seven", "caps:cib-seven"])
  })

  it("flags Sie/Ihr/Ihnen as address in German, except at an ambiguous sentence start", () => {
    expect(
      rules({
        ihnen: "Wir zeigen Ihnen die Liste.",
        ihr: "Speichere Ihre Einstellungen.",
        sie: "Möchten Sie fortfahren?",
        start: "Ihr Team sieht das.",
        afterStop: "Fertig. Sie ist gespeichert.",
        quoted: "„Sie“ steht in Anführungszeichen.",
      }),
    ).toEqual(["ihnen:formal-address", "ihr:formal-address", "sie:formal-address"])
    expect(rules({ en: "Sie Ihnen" }, "en")).toEqual([])
  })

  it("flags an impersonal man in German only", () => {
    expect(
      rules({ man: "Hier kann man filtern.", Man: "Man sieht nichts.", ok: "Manche" }),
    ).toEqual(["man:impersonal-man", "Man:impersonal-man"])
    expect(rules({ man: "man" }, "en")).toEqual([])
  })

  it("renders function entries with 1 and 2 and flags a missing singular", () => {
    expect(
      rules(
        {
          plural: ({ count }: { count: number }) => `${count} incidents`,
          ok: ({ count }: { count: number }) => `${count} incident${count === 1 ? "" : "s"}`,
          template: "{count} engines configured",
          message: (message: string) => `Failed: ${message}`,
        },
        "en",
      ),
    ).toEqual(["plural:plural", "template:plural"])
    expect(
      rules({
        tage: "{n} Tage",
        tag: ({ n }: { n: number }) => (n === 1 ? "1 Tag" : `${n} Tage`),
        fehler: "{n} Fehler",
      }),
    ).toEqual(["tage:plural"])
  })

  it("walks nested objects with dotted keys and reports an entry it cannot render", () => {
    const nested = {
      group: { inner: "KI", deeper: { leaf: "CIB Seven" } },
      broken: (p: { list: string[] }) => p.list.join(", "),
    }
    expect(rules(nested)).toEqual([
      "group.inner:ki",
      "group.deeper.leaf:cib-seven",
      "broken:render-error",
    ])
    const withParams = catalogTextFindings(nested, {
      language: "de",
      params: { broken: { list: ["a", "b"] } },
    })
    expect(withParams.map((f) => f.key)).toEqual(["group.inner", "group.deeper.leaf"])
  })

  it("reports the rendered text of the finding", () => {
    expect(catalogTextFindings({ k: "{count} jobs" }, { language: "en" })).toEqual([
      { key: "k", rule: "plural", text: "1 jobs" },
    ])
  })
})
