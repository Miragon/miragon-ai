import { createBuilderTexts } from "@miragon/pulse-widget-shell/server"
import { catalogs } from "./messages/index.js"

/**
 * How the view builder (toolkit 2.8) names analytics' widgets, pipeline steps
 * and props fields for people, in English and German: the `builder.*`
 * entries of analytics' catalogs (`messages/{en,de}.builder.ts`), held to the
 * voice and glossary gates like the widget texts. The definitions'
 * `description`s stay the model's text.
 */
const texts = createBuilderTexts(catalogs, "analytics")

export const builderAppTitle = texts.appTitle
export const builderText = texts.text
export const fieldText = texts.field
