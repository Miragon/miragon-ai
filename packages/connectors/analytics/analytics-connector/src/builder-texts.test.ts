import { describe, expect, it } from "vitest"
import {
  displayTextCatalog,
  displayTextsSentToModel,
  missingDisplayTexts,
} from "@miragon-ai/widget-shell/testing"
import { definition } from "./definition.js"
import { catalogs } from "./messages/index.js"

/**
 * The view builder (toolkit 2.8) shows people each widget, data source and
 * props field by its title and summary, else by its id. analytics names every
 * one of them in English and German, from the `builder.*` entries of its
 * catalogs — where `brand-gates.test.ts` and `messages/glossary.test.ts` hold
 * them to the voice and the glossary like the widget texts.
 */
describe("analytics names every builder piece for people", () => {
  it("every widget, step and props field has an en and a de title and summary", () => {
    expect(missingDisplayTexts(definition)).toEqual([])
  })

  it("none of those texts reaches the model through get-framework-manifest", () => {
    expect(displayTextsSentToModel(definition)).toEqual([])
  })

  it.each(["en", "de"] as const)("%s: no builder entry in the catalog goes unused", (language) => {
    const shown = new Set(Object.values(displayTextCatalog(definition, language)))
    const unused = Object.entries(catalogs[language])
      .filter(([key]) => key.startsWith("builder."))
      .filter(([, text]) => typeof text !== "string" || !shown.has(text))
      .map(([key]) => key)
    expect(unused).toEqual([])
  })

  it("both languages name the same pieces", () => {
    const keys = (language: "en" | "de") =>
      Object.keys(catalogs[language]).filter((key) => key.startsWith("builder."))
    expect(keys("de")).toEqual(keys("en"))
  })
})
