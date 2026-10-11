import {
  PROPS_SCHEMA_DISPLAY_KEYWORD,
  type AppDefinition,
  type DisplayText,
  type LocalizedText,
} from "@miragon/mcp-toolkit-core"
import type { CatalogLanguage } from "./catalog-text.js"

/**
 * The builder gate: the toolkit's view builder (2.8) shows each widget, step
 * and props field by its `title` (and `summary`) — `DisplayText` on the
 * definitions, `x-display` on a propsSchema property — and falls back to the
 * technical id without one. A module's people read those names in both
 * languages, so every one carries an en and a de text:
 *
 *   expect(missingDisplayTexts(definition)).toEqual([])
 *   expect(catalogTextFindings(displayTextCatalog(definition, "de"), { language: "de" })).toEqual([])
 */

/** One place the builder names something: where, which field, and its text. */
interface DisplayEntry {
  /** `app`, `widget <id>`, `step <id>` or `prop <widget id>.<path>`. */
  where: string
  field: "title" | "summary"
  text: LocalizedText | undefined
}

type JsonSchema = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Every property of a JSON schema, nested objects and array items included, by dotted path. */
function schemaProperties(schema: unknown, prefix = ""): [path: string, node: JsonSchema][] {
  if (!isRecord(schema)) return []
  const found: [string, JsonSchema][] = []
  const properties = isRecord(schema.properties) ? schema.properties : {}
  for (const [name, node] of Object.entries(properties)) {
    if (!isRecord(node)) continue
    const path = prefix ? `${prefix}.${name}` : name
    found.push([path, node], ...schemaProperties(node, path))
    if (isRecord(node.items)) found.push(...schemaProperties(node.items, `${path}[]`))
  }
  return found
}

function displayEntries(where: string, text: DisplayText | undefined): DisplayEntry[] {
  return [
    { where, field: "title", text: text?.title },
    { where, field: "summary", text: text?.summary },
  ]
}

/** Every name the builder shows for an app's pieces, with the text it carries (or none). */
function entriesOf(definition: AppDefinition): DisplayEntry[] {
  return [
    { where: "app", field: "title", text: definition.title },
    ...definition.widgets.flatMap((widget) => [
      ...displayEntries(`widget ${widget.id}`, widget),
      ...schemaProperties(widget.propsSchema).flatMap(([path, node]) =>
        displayEntries(
          `prop ${widget.id}.${path}`,
          node[PROPS_SCHEMA_DISPLAY_KEYWORD] as DisplayText | undefined,
        ),
      ),
    ]),
    ...definition.steps.flatMap((step) => displayEntries(`step ${step.id}`, step)),
  ]
}

function textIn(text: LocalizedText | undefined, language: string): string | undefined {
  if (text === undefined) return undefined
  const value = typeof text === "string" ? text : text[language]
  return value?.trim() ? value : undefined
}

/**
 * The pieces the builder would show by id in a language: a widget, step or
 * props field (nested ones included) without a title or a summary, the app
 * without a title — `"widget camunda7:job-panel: no de summary"`.
 */
export function missingDisplayTexts(
  definition: AppDefinition,
  languages: readonly CatalogLanguage[] = ["en", "de"],
): string[] {
  return entriesOf(definition).flatMap((entry) =>
    languages
      .filter((language) => textIn(entry.text, language) === undefined)
      .map((language) => `${entry.where}: no ${language} ${entry.field}`),
  )
}

/**
 * The builder texts of a definition in one language as a message catalog
 * (`"widget camunda7:job-panel.title": "Jobs"`), for the voice and glossary
 * gates (`catalogTextFindings`, `glossaryFindings`).
 */
export function displayTextCatalog(
  definition: AppDefinition,
  language: CatalogLanguage,
): Record<string, string> {
  const catalog: Record<string, string> = {}
  for (const entry of entriesOf(definition)) {
    const text = textIn(entry.text, language)
    if (text !== undefined) catalog[`${entry.where}.${entry.field}`] = text
  }
  return catalog
}
