import { describe, expect, it } from "vitest"
import type { AppDefinition } from "@miragon/mcp-toolkit-core"
import { shellDefinition } from "../shell-catalogue.js"
import { catalogTextFindings } from "./catalog-text.js"
import { displayTextCatalog, missingDisplayTexts } from "./display-texts.js"
import { glossaryFindings, PRODUCT_GLOSSARY } from "./glossary.js"

const both = (en: string, de: string) => ({ en, de })

/** A small app: one named widget with a nested props field, one bare step. */
const APP: AppDefinition = {
  name: "probe",
  title: both("Probe", "Probe"),
  steps: [
    {
      id: "probe:load",
      dataType: "probe:data",
      requires: [],
      produces: [],
      execute: () => Promise.resolve({ data: null, keys: {}, _app: "probe", _step: "load" }),
    },
  ],
  widgets: [
    {
      id: "probe:table",
      title: both("Table", "Tabelle"),
      summary: "Only one language",
      requires: [],
      size: "full",
      propsSchema: {
        type: "object",
        properties: {
          dataKey: {
            type: "string",
            "x-display": { title: both("Data key", "Datenschlüssel"), summary: both("", " ") },
          },
          columns: {
            type: "array",
            items: { type: "object", properties: { key: { type: "string" } } },
          },
          options: { type: "object", properties: { dense: { type: "boolean" } } },
        },
      },
    },
  ],
}

describe("missingDisplayTexts", () => {
  it("names every piece the builder would show by id, per language and field", () => {
    expect(missingDisplayTexts(APP)).toEqual([
      // A plain string serves every language.
      "prop probe:table.dataKey: no en summary",
      "prop probe:table.dataKey: no de summary",
      "prop probe:table.columns: no en title",
      "prop probe:table.columns: no de title",
      "prop probe:table.columns: no en summary",
      "prop probe:table.columns: no de summary",
      "prop probe:table.columns[].key: no en title",
      "prop probe:table.columns[].key: no de title",
      "prop probe:table.columns[].key: no en summary",
      "prop probe:table.columns[].key: no de summary",
      "prop probe:table.options: no en title",
      "prop probe:table.options: no de title",
      "prop probe:table.options: no en summary",
      "prop probe:table.options: no de summary",
      "prop probe:table.options.dense: no en title",
      "prop probe:table.options.dense: no de title",
      "prop probe:table.options.dense: no en summary",
      "prop probe:table.options.dense: no de summary",
      "step probe:load: no en title",
      "step probe:load: no de title",
      "step probe:load: no en summary",
      "step probe:load: no de summary",
    ])
  })

  it("checks only the languages asked for, and the app's title", () => {
    const untitled: AppDefinition = { ...APP, title: both("Probe", ""), steps: [], widgets: [] }
    expect(missingDisplayTexts(untitled, ["de"])).toEqual(["app: no de title"])
    expect(missingDisplayTexts(untitled, ["en"])).toEqual([])
  })
})

describe("displayTextCatalog", () => {
  it("lists the texts of one language by where they show, skipping blanks", () => {
    expect(displayTextCatalog(APP, "de")).toEqual({
      "app.title": "Probe",
      "widget probe:table.title": "Tabelle",
      "widget probe:table.summary": "Only one language",
      "prop probe:table.dataKey.title": "Datenschlüssel",
    })
  })
})

/** The kit's own catalogue: the generic shell:* widgets every server registers. */
describe("the shell:* widgets are named for people in en and de", () => {
  it("every widget and props field carries a title and a summary", () => {
    expect(missingDisplayTexts(shellDefinition)).toEqual([])
  })

  it.each(["en", "de"] as const)("%s: in the brand voice and the product glossary", (language) => {
    const catalog = displayTextCatalog(shellDefinition, language)
    expect(catalogTextFindings(catalog, { language })).toEqual([])
    expect(glossaryFindings(catalog, PRODUCT_GLOSSARY[language])).toEqual([])
  })
})
