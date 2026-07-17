import { z } from "zod"
import type { AppPlugin, AppDefinition } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use/server"

/**
 * The `shell` module: generic, module-agnostic widgets every deployment gets.
 * They render plain data from ANY context key (named via `props.dataKey`), so
 * an upstream module manifest — whose steps can only produce keys under its
 * own namespace — can feed a standard KPI row or data table without shipping
 * a widget bundle:
 *
 *   step:   produces ["miravelo:kpis"]
 *   layout: { widget: "shell:kpi-grid", props: { dataKey: "miravelo:kpis" } }
 *
 * The components live in the shared widget kit
 * (`@miragon-ai/widget-shell/widgets`, see `generic-widgets.tsx`); this file
 * only carries their catalogue metadata and is registered unconditionally in
 * `setup.ts` (no tools, no steps — nothing to filter per toolset).
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
        "Generic KPI strip. Renders the cells found under props.dataKey — lets any module or upstream step feed a standard KPI row without shipping its own widget.",
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
