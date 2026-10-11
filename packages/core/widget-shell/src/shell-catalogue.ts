import { z } from "zod"
import {
  PROPS_SCHEMA_DISPLAY_KEYWORD,
  type AppDefinition,
  type AppPlugin,
  type LocalizedText,
} from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"

/**
 * The `shell` module: generic, module-agnostic widgets every deployment gets.
 * They render plain data from ANY context key (named via `props.dataKey`) —
 * the standard composition targets for `render-view` and the visual builder,
 * so any module or pipeline step can feed a KPI row or data table without
 * shipping a dedicated widget:
 *
 *   step:   produces ["camunda7:kpis"]
 *   layout: { widget: "shell:kpi-grid", props: { dataKey: "camunda7:kpis" } }
 *
 * Components live next door in `src/ui/generic-widgets.tsx` (exported via
 * `@miragon-ai/widget-shell/widgets`); this file carries their catalogue
 * metadata so host apps register the plugin without owning any domain UI
 * (no tools, no steps — nothing to filter per toolset).
 *
 * `description`s are the model's text; the view builder shows people the
 * `title`/`summary` (and each field's `x-display`) in English or German
 * (toolkit 2.8), never sent to the model.
 */

/** A text in both languages the builder speaks. */
const both = (en: string, de: string): LocalizedText => ({ en, de })

/** A props field's label and help line in the builder's props sheet. */
const field = (title: LocalizedText, summary: LocalizedText) => ({
  [PROPS_SCHEMA_DISPLAY_KEYWORD]: { title, summary },
})

const DATA_KEY = both("Data key", "Datenschlüssel")
const EMPTY_TEXT = both("Text without data", "Text ohne Daten")

const kpiGridPropsSchema = z.toJSONSchema(
  z.object({
    dataKey: z
      .string()
      .describe(
        'Context key holding the KPI cells — either an array of { label, value, tone?, fraction? } (tone: danger|warning|success|info|neutral) or a plain { "label": value } object.',
      )
      .meta(
        field(
          DATA_KEY,
          both(
            "The key whose metrics the strip shows.",
            "Der Schlüssel, dessen Kennzahlen die Leiste zeigt.",
          ),
        ),
      ),
    boxed: z
      .boolean()
      .optional()
      .describe("Wrap the strip in a rounded bordered card.")
      .meta(
        field(
          both("Framed", "Mit Rahmen"),
          both(
            "Draws the strip in a framed card.",
            "Zeichnet die Leiste in einer Karte mit Rahmen.",
          ),
        ),
      ),
    variant: z
      .enum(["strip", "soft"])
      .optional()
      .describe('"soft" renders tone-tinted cards instead of the bordered strip.')
      .meta(
        field(
          both("Style", "Darstellung"),
          both(
            "One strip, or a tinted card per metric.",
            "Eine Leiste oder eine getönte Karte je Kennzahl.",
          ),
        ),
      ),
    emptyText: z
      .string()
      .optional()
      .describe("Text shown when the key holds no usable cells.")
      .meta(
        field(
          EMPTY_TEXT,
          both(
            "Shown when the key holds no metrics.",
            "Erscheint, wenn der Schlüssel keine Kennzahlen enthält.",
          ),
        ),
      ),
  }),
)

const dataTablePropsSchema = z.toJSONSchema(
  z.object({
    dataKey: z
      .string()
      .describe("Context key holding the rows — an array of flat records, or { rows: [...] }.")
      .meta(
        field(
          DATA_KEY,
          both(
            "The key whose records the table shows.",
            "Der Schlüssel, dessen Datensätze die Tabelle zeigt.",
          ),
        ),
      ),
    columns: z
      .array(
        z.object({
          key: z
            .string()
            .describe("Record field to render.")
            .meta(
              field(
                both("Field", "Feld"),
                both("The record field of the column.", "Das Feld des Datensatzes für die Spalte."),
              ),
            ),
          label: z
            .string()
            .optional()
            .describe("Column header (defaults to the key).")
            .meta(
              field(
                both("Header", "Spaltenkopf"),
                both(
                  "The column's header. Without it, the field name.",
                  "Der Kopf der Spalte. Ohne Angabe der Feldname.",
                ),
              ),
            ),
          align: z
            .enum(["left", "right"])
            .optional()
            .meta(
              field(
                both("Alignment", "Ausrichtung"),
                both(
                  "Left or right. Numbers read best right.",
                  "Links oder rechts. Zahlen stehen am besten rechts.",
                ),
              ),
            ),
        }),
      )
      .optional()
      .describe("Column spec; derived from the first row's primitive fields when omitted.")
      .meta(
        field(
          both("Columns", "Spalten"),
          both(
            "The fields the table shows. Without them, those of the first row.",
            "Die Felder, die die Tabelle zeigt. Ohne Angabe die der ersten Zeile.",
          ),
        ),
      ),
    emptyText: z
      .string()
      .optional()
      .describe("Text shown when there are no rows.")
      .meta(
        field(
          EMPTY_TEXT,
          both("Shown when there are no rows.", "Erscheint, wenn es keine Zeilen gibt."),
        ),
      ),
  }),
)

export const shellDefinition: AppDefinition = {
  name: "shell",
  title: both("Building blocks", "Bausteine"),
  steps: [],
  widgets: [
    {
      id: "shell:kpi-grid",
      title: both("Metric strip", "Kennzahlenleiste"),
      summary: both(
        "A row of metrics from any data key.",
        "Eine Reihe Kennzahlen aus einem beliebigen Datenschlüssel.",
      ),
      description:
        "Generic KPI strip. Renders the cells found under props.dataKey — lets any module or pipeline step feed a standard KPI row without shipping its own widget.",
      requires: [],
      consumes: [],
      size: "half",
      propsSchema: kpiGridPropsSchema,
    },
    {
      id: "shell:data-table",
      title: both("Data table", "Datentabelle"),
      summary: both(
        "A table of the records under any data key.",
        "Eine Tabelle der Datensätze unter einem beliebigen Datenschlüssel.",
      ),
      description:
        "Generic data table. Renders the array of records found under props.dataKey as a cockpit-style table — columns configurable or derived from the data.",
      requires: [],
      consumes: [],
      size: "full",
      propsSchema: dataTablePropsSchema,
    },
  ],
}

export function createShellPlugin(): AppPlugin<MCPServer> {
  return { definition: shellDefinition }
}
