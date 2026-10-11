import { describe, expect, it } from "vitest"
import { PROPS_SCHEMA_DISPLAY_KEYWORD } from "@miragon/mcp-toolkit-core"
import { createBuilderTexts } from "./builder-texts.js"

const catalogs = {
  en: {
    "builder.app.title": "Orders",
    "builder.widget.table.title": "Order table",
    "builder.widget.table.summary": "Every order of one customer.",
    "builder.field.table.customer.title": "Customer",
    "builder.field.table.customer.summary": "Whose orders the table shows.",
    "builder.widget.broken.title": "Broken",
    "builder.widget.counted.title": () => "a function entry",
    "builder.widget.counted.summary": "x",
  },
  de: {
    "builder.app.title": "Bestellungen",
    "builder.widget.table.title": "Bestelltabelle",
    "builder.widget.table.summary": "Alle Bestellungen eines Kunden.",
    "builder.field.table.customer.title": "Kunde",
    "builder.field.table.customer.summary": "Wessen Bestellungen die Tabelle zeigt.",
    "builder.widget.counted.title": "x",
    "builder.widget.counted.summary": "x",
  },
}

describe("createBuilderTexts", () => {
  const texts = createBuilderTexts(catalogs, "orders")

  it("reads the app title, a widget's title and summary in both languages", () => {
    expect(texts.appTitle()).toEqual({ en: "Orders", de: "Bestellungen" })
    expect(texts.text("widget.table")).toEqual({
      title: { en: "Order table", de: "Bestelltabelle" },
      summary: { en: "Every order of one customer.", de: "Alle Bestellungen eines Kunden." },
    })
  })

  it("puts a field's texts under the toolkit's x-display keyword", () => {
    expect(PROPS_SCHEMA_DISPLAY_KEYWORD).toBe("x-display")
    expect(texts.field("table.customer")).toEqual({
      "x-display": {
        title: { en: "Customer", de: "Kunde" },
        summary: {
          en: "Whose orders the table shows.",
          de: "Wessen Bestellungen die Tabelle zeigt.",
        },
      },
    })
  })

  it("throws, naming the module and the key, when a language lacks a text", () => {
    expect(() => texts.text("widget.broken")).toThrow(
      'orders builder text "builder.widget.broken.title" is missing in the en or de catalog',
    )
    expect(() => texts.text("widget.unknown")).toThrow(/builder\.widget\.unknown\.title/)
    // A function entry is no name the builder can show.
    expect(() => texts.text("widget.counted")).toThrow(/builder\.widget\.counted\.title/)
    expect(() => createBuilderTexts({ en: catalogs.en }, "orders").appTitle()).toThrow(
      /builder\.app\.title/,
    )
  })
})
