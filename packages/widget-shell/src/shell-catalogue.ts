import { z } from "zod"
import type { AppPlugin, AppDefinition } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use/server"

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
 */

const kpiGridPropsSchema = z.toJSONSchema(
  z.object({
    dataKey: z
      .string()
      .describe(
        'Context key holding the KPI cells — either an array of { label, value, tone?, fraction? } (tone: critical|warning|success|info|neutral) or a plain { "label": value } object.',
      ),
    boxed: z.boolean().optional().describe("Wrap the strip in a rounded bordered card."),
    variant: z
      .enum(["strip", "soft"])
      .optional()
      .describe('"soft" renders tone-tinted cards instead of the bordered strip.'),
    emptyText: z.string().optional().describe("Text shown when the key holds no usable cells."),
  }),
)

const dataTablePropsSchema = z.toJSONSchema(
  z.object({
    dataKey: z
      .string()
      .describe("Context key holding the rows — an array of flat records, or { rows: [...] }."),
    columns: z
      .array(
        z.object({
          key: z.string().describe("Record field to render."),
          label: z.string().optional().describe("Column header (defaults to the key)."),
          align: z.enum(["left", "right"]).optional(),
        }),
      )
      .optional()
      .describe("Column spec; derived from the first row's primitive fields when omitted."),
    emptyText: z.string().optional().describe("Text shown when there are no rows."),
  }),
)

export const shellDefinition: AppDefinition = {
  name: "shell",
  steps: [],
  widgets: [
    {
      id: "shell:kpi-grid",
      description:
        "Generic KPI strip. Renders the cells found under props.dataKey — lets any module or pipeline step feed a standard KPI row without shipping its own widget.",
      requires: [],
      consumes: [],
      size: "half",
      propsSchema: kpiGridPropsSchema,
    },
    {
      id: "shell:data-table",
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
