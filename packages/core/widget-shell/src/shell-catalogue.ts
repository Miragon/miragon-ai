import { z } from "zod"
import {
  PROPS_SCHEMA_DISPLAY_KEYWORD,
  type AppDefinition,
  type AppPlugin,
  type LocalizedText,
} from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"
import { SHELL_SETTINGS_PAGE_WIDGET, SHELL_SETTINGS_WIDGET } from "./shell-settings-contract.js"
import { registerShellSettingsTools, type ShellSettingsToolsOptions } from "./shell-settings.js"

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
 * Components live next door in `src/ui/generic-widgets.tsx` and
 * `src/ui/shell-settings.tsx` (exported via `@miragon-ai/widget-shell/widgets`,
 * all four in `shellWidgets`); this file carries their catalogue metadata so
 * host apps register the plugin without owning any domain UI. Its only tools
 * are the settings triple (`shell-settings.ts`), and no step.
 *
 * `description`s are the model's text; the view builder shows people the
 * `title`/`summary` (and each top-level field's `x-display`) in English or
 * German (toolkit 2.8), never sent to the model.
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
    // The props sheet edits top-level fields only (an array is JSON there),
    // and the toolkit strips `x-display` at that level only: the column
    // fields carry no builder text, or it would reach the model.
    columns: z
      .array(
        z.object({
          key: z.string().describe("Record field to render."),
          label: z
            .string()
            .optional()
            .describe(
              "Column header (defaults to the key in words: totalIncidents → Total incidents).",
            ),
          align: z.enum(["left", "right"]).optional(),
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
    {
      // Self-fetching from shell_settings_data; one row of the settings page.
      id: SHELL_SETTINGS_WIDGET,
      title: both("Language", "Sprache"),
      summary: both(
        "The language of the views and the summaries.",
        "Die Sprache der Ansichten und der Zusammenfassungen.",
      ),
      description: "The UI language section of the settings page (shell_save_settings changes it).",
      requires: [],
      consumes: [],
      size: "full",
    },
    {
      // The page itself: the language section, then every `<module>:settings`
      // section the host bundles — opened by shell_show_settings and the
      // cockpit's settings tab, not composed into a view.
      id: SHELL_SETTINGS_PAGE_WIDGET,
      title: both("Settings", "Einstellungen"),
      summary: both(
        "The language and every module's settings on one page.",
        "Die Sprache und die Einstellungen jedes Moduls auf einer Seite.",
      ),
      description:
        "The whole settings page — opened by shell_show_settings, not composed into a view.",
      requires: [],
      consumes: [],
      size: "full",
    },
  ],
}

export type ShellPluginOptions = ShellSettingsToolsOptions

/**
 * The always-on shell plugin. With a profile store it registers the settings
 * triple; without one (a root that persists nothing) the page renders the
 * module sections alone and `ProfileGate` falls back to the host's locale.
 */
export function createShellPlugin(options?: ShellPluginOptions): AppPlugin<MCPServer> {
  if (!options) return { definition: shellDefinition }
  return {
    definition: shellDefinition,
    registerWidgetTools: (server) => registerShellSettingsTools(server, options),
  }
}
