import type { WidgetProps } from "@miragon/mcp-toolkit-core"
import { KpiGrid, resolveTone, useLocale, type KpiCell } from "@miragon/mcp-toolkit-ui"
import { humanizeKey } from "./humanize-key.js"
import { kitLabels, type KitLabels } from "./kit-labels.js"
import { ListTable } from "./list-table.js"
import { TableEmptyState, Td } from "./table.js"

/**
 * Module-agnostic widgets — the standard composition targets for
 * `render-view` and the visual builder: any module or pipeline step produces
 * a context key with plain data, and a layout cell points a generic widget at
 * it via `props.dataKey` — no custom widget needed for a standard KPI row or
 * data table.
 *
 * Registered by the server app under the `shell:` namespace (see
 * `../shell-catalogue.ts`, exported via `@miragon-ai/widget-shell/server`). Their texts arrive via
 * props; what they say themselves (the empty state, a Boolean's "Yes"/"No",
 * the table's name) follows the active locale through `kitLabels`.
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function isPrimitive(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean"
}

type YesNo = Pick<KitLabels, "yes" | "no">

/** A cell as shown: numbers and text as they are, a Boolean in words, anything else a dash. */
function cellValue(v: unknown, words: YesNo): string | number {
  if (typeof v === "number") return v
  if (typeof v === "string") return v
  if (typeof v === "boolean") return v ? words.yes : words.no
  return "—"
}

/**
 * Accepts either an array of `{ label, value, tone?, fraction? }` cells or a
 * plain `{ label: value }` object; everything else renders as empty.
 */
function coerceKpiCells(raw: unknown, words: YesNo): KpiCell[] {
  if (Array.isArray(raw)) {
    return raw
      .filter(isRecord)
      .filter((r) => typeof r.label === "string" && r.label.length > 0)
      .map((r) => ({
        label: r.label as string,
        value: cellValue(r.value, words),
        // A tone from the wire: the five tones as is, a retired name
        // (`critical`) onto its tone, anything else neutral (no dot).
        tone: typeof r.tone === "string" ? resolveTone(r.tone) : undefined,
        fraction: typeof r.fraction === "string" ? r.fraction : undefined,
      }))
  }
  if (isRecord(raw)) {
    return Object.entries(raw)
      .filter(([, v]) => isPrimitive(v))
      .map(([label, v]) => ({ label, value: cellValue(v, words) }))
  }
  return []
}

/**
 * `shell:kpi-grid` — renders `keys[props.dataKey]` as a KPI strip.
 * widgetProps: `dataKey` (required), `boxed?`, `variant?` ("strip" | "soft"),
 * `emptyText?`.
 */
export function GenericKpiGridWidget({ keys, widgetProps }: WidgetProps) {
  const labels = kitLabels(useLocale())
  const dataKey = typeof widgetProps?.dataKey === "string" ? widgetProps.dataKey : undefined
  const cells = coerceKpiCells(dataKey ? keys[dataKey] : undefined, labels)
  if (cells.length === 0) {
    return typeof widgetProps?.emptyText === "string" ? (
      <TableEmptyState>{widgetProps.emptyText}</TableEmptyState>
    ) : (
      <TableEmptyState description={labels.noDataHint}>{labels.noFiguresYet}</TableEmptyState>
    )
  }
  return (
    <KpiGrid
      cells={cells}
      boxed={widgetProps?.boxed === true}
      variant={widgetProps?.variant === "soft" ? "soft" : "strip"}
    />
  )
}

interface ColumnSpec {
  key: string
  label: string
  align: "left" | "right"
}

/**
 * The table's columns: the `columns` prop as given, else the first row's
 * primitive fields. A header nobody wrote is the key in words ("Total
 * incidents" for `totalIncidents`); a written `label` stays as it is.
 */
function coerceColumns(raw: unknown, rows: Record<string, unknown>[]): ColumnSpec[] {
  if (Array.isArray(raw)) {
    const cols = raw
      .filter(isRecord)
      .filter((c) => typeof c.key === "string" && c.key.length > 0)
      .map((c) => ({
        key: c.key as string,
        label: typeof c.label === "string" ? c.label : humanizeKey(c.key as string),
        align: c.align === "right" ? ("right" as const) : ("left" as const),
      }))
    if (cols.length > 0) return cols
  }
  // Derive from the first row: primitive-valued keys, capped for readability.
  const first = rows[0]
  if (!first) return []
  return Object.keys(first)
    .filter((k) => isPrimitive(first[k]) || first[k] === null)
    .slice(0, 8)
    .map((key) => ({
      key,
      label: humanizeKey(key),
      align: typeof first[key] === "number" ? ("right" as const) : ("left" as const),
    }))
}

/**
 * `shell:data-table` — renders `keys[props.dataKey]` (an array of records, or
 * `{ rows: [...] }`) as a cockpit-style table. widgetProps: `dataKey`
 * (required), `columns?` (`[{ key, label?, align? }]`, derived from the first
 * row when omitted; a missing `label` is the key in words), `emptyText?`.
 */
export function GenericDataTableWidget({ keys, widgetProps }: WidgetProps) {
  const labels = kitLabels(useLocale())
  const dataKey = typeof widgetProps?.dataKey === "string" ? widgetProps.dataKey : undefined
  const raw = dataKey ? keys[dataKey] : undefined
  const rows = (
    Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.rows) ? raw.rows : []
  ).filter(isRecord)
  const columns = coerceColumns(widgetProps?.columns, rows)

  if (rows.length === 0 || columns.length === 0) {
    return typeof widgetProps?.emptyText === "string" ? (
      <TableEmptyState>{widgetProps.emptyText}</TableEmptyState>
    ) : (
      <TableEmptyState description={labels.noDataHint}>{labels.noRowsYet}</TableEmptyState>
    )
  }

  return (
    <div className="border-border overflow-hidden rounded-md border">
      <ListTable
        ariaLabel={labels.dataTable}
        columns={columns.map((col) => ({ label: col.label, align: col.align }))}
      >
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map((col) => (
              <Td key={col.key} align={col.align}>
                {cellValue(row[col.key], labels)}
              </Td>
            ))}
          </tr>
        ))}
      </ListTable>
    </div>
  )
}
