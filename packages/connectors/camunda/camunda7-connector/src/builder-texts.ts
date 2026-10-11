import { createBuilderTexts } from "@miragon-ai/widget-shell/server"
import { catalogs } from "./messages/index.js"

/**
 * How the view builder (toolkit 2.8) names camunda7's widgets, pipeline steps
 * and props fields for people, in English and German: the `builder.*`
 * entries of camunda7's catalogs (`messages/{en,de}.builder.ts`), held to the
 * voice, glossary and en/de parity gates like every other camunda7 string.
 * The definitions' `description`s stay the model's text.
 */
const texts = createBuilderTexts(catalogs, "camunda7")

export const builderAppTitle = texts.appTitle
export const builderText = texts.text
export const fieldText = texts.field
