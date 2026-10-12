import {
  PROPS_SCHEMA_DISPLAY_KEYWORD,
  type Catalogs,
  type DisplayText,
  type LocalizedText,
} from "@miragon/mcp-toolkit-core"

/** The view builder's names of a module, read from the module's catalogs. */
export interface BuilderTexts {
  /** The app's title: the heading of its group in the builder's palette (`builder.app.title`). */
  appTitle: () => LocalizedText
  /** A widget's or step's title and one-line summary (`builder.<key>.title` / `.summary`). */
  text: (key: string) => Required<Pick<DisplayText, "title" | "summary">>
  /**
   * A propsSchema field's label and help line in the builder's props sheet, as
   * zod metadata: `.meta(field("processList.nameLike"))` puts the toolkit's
   * `x-display` keyword (`builder.field.<key>.*`) on the field's JSON schema.
   */
  field: (key: string) => Record<string, unknown>
}

/**
 * How the toolkit's view builder (2.8) names a module's widgets, pipeline
 * steps and props fields for people — `DisplayText` on the definitions,
 * `x-display` on a propsSchema field — in English and German, from the
 * `builder.*` entries of the module's own catalogs. The words then sit next
 * to the module's other strings, so its voice, glossary and en/de parity
 * gates hold them too; the definitions' `description`s stay the model's
 * text, and the toolkit never sends these to the model. A missing entry
 * throws as the definitions load, so every test that imports them fails;
 * `missingDisplayTexts` (`/testing`) checks that nothing is left unnamed.
 */
export function createBuilderTexts(catalogs: Catalogs, module: string): BuilderTexts {
  const localized = (key: string): LocalizedText => {
    const en = catalogs.en?.[key]
    const de = catalogs.de?.[key]
    if (typeof en !== "string" || typeof de !== "string") {
      throw new Error(`${module} builder text "${key}" is missing in the en or de catalog`)
    }
    return { en, de }
  }
  const text = (key: string) => ({
    title: localized(`builder.${key}.title`),
    summary: localized(`builder.${key}.summary`),
  })
  return {
    appTitle: () => localized("builder.app.title"),
    text,
    field: (key) => ({ [PROPS_SCHEMA_DISPLAY_KEYWORD]: text(`field.${key}`) }),
  }
}
