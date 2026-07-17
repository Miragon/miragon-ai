import type { WidgetProps } from "@miragon/mcp-toolkit-core"
import { KpiGrid, type KpiCell } from "./kpi-grid.js"
import { TableEmptyState, Td, Th } from "./table.js"
import type { ToneVariant } from "./tone-utils.js"

/**
 * Module-agnostic widgets for the federation path: an upstream (or any
 * pipeline step) produces a context key with plain data, and a `render-view`
 * layout cell points a generic widget at it via `props.dataKey` — no custom
 * widget bundle needed for a standard KPI row or data table.
 *
 * Registered by the gateway under the `shell:` namespace (see
 * `apps/mcp-gateway/src/shell-widgets.ts`). All texts arrive via props —
 * the shell carries no module i18n.
 */

const TONES: ReadonlySet<string> = new Set(["critical", "warning", "success", "info", "neutral"])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function isPrimitive(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean"
}

function cellValue(v: unknown): string | number {
  if (typeof v === "number") return v
  if (typeof v === "string") return v
  if (typeof v === "boolean") return String(v)
  return "—"
}

/**
 * Accepts either an array of `{ label, value, tone?, fraction? }` cells or a
 * plain `{ label: value }` object; everything else renders as empty.
 */
function coerceKpiCells(raw: unknown): KpiCell[] {
  if (Array.isArray(raw)) {
    return raw
      .filter(isRecord)
      .filter((r) => typeof r.label === "string" && r.label.length > 0)
      .map((r) => ({
        label: r.label as string,
        value: cellValue(r.value),
        tone: typeof r.tone === "string" && TONES.has(r.tone) ? (r.tone as ToneVariant) : undefined,
        fraction: typeof r.fraction === "string" ? r.fraction : undefined,
      }))
  }
  if (isRecord(raw)) {
    return Object.entries(raw)
      .filter(([, v]) => isPrimitive(v))
      .map(([label, v]) => ({ label, value: cellValue(v) }))
  }
  return []
}

/**
 * `shell:kpi-grid` — renders `keys[props.dataKey]` as a KPI strip.
 * widgetProps: `dataKey` (required), `boxed?`, `variant?` ("strip" | "soft"),
 * `emptyText?`.
 */
export function GenericKpiGridWidget({ keys, widgetProps }: WidgetProps) {
  const dataKey = typeof widgetProps?.dataKey === "string" ? widgetProps.dataKey : undefined
  const cells = coerceKpiCells(dataKey ? keys[dataKey] : undefined)
  if (cells.length === 0) {
    return (
      <TableEmptyState>
        {typeof widgetProps?.emptyText === "string"
          ? widgetProps.emptyText
          : `No KPI data under "${dataKey ?? "(missing dataKey prop)"}"`}
      </TableEmptyState>
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

function coerceColumns(raw: unknown, rows: Record<string, unknown>[]): ColumnSpec[] {
  if (Array.isArray(raw)) {
    const cols = raw
      .filter(isRecord)
      .filter((c) => typeof c.key === "string" && c.key.length > 0)
      .map((c) => ({
        key: c.key as string,
        label: typeof c.label === "string" ? c.label : (c.key as string),
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
      label: key,
      align: typeof first[key] === "number" ? ("right" as const) : ("left" as const),
    }))
}

/**
 * `shell:data-table` — renders `keys[props.dataKey]` (an array of records, or
 * `{ rows: [...] }`) as a cockpit-style table. widgetProps: `dataKey`
 * (required), `columns?` (`[{ key, label?, align? }]`, derived from the first
 * row when omitted), `emptyText?`.
 */
export function GenericDataTableWidget({ keys, widgetProps }: WidgetProps) {
  const dataKey = typeof widgetProps?.dataKey === "string" ? widgetProps.dataKey : undefined
  const raw = dataKey ? keys[dataKey] : undefined
  const rows = (
    Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.rows) ? raw.rows : []
  ).filter(isRecord)
  const columns = coerceColumns(widgetProps?.columns, rows)

  if (rows.length === 0 || columns.length === 0) {
    return (
      <TableEmptyState>
        {typeof widgetProps?.emptyText === "string"
          ? widgetProps.emptyText
          : `No rows under "${dataKey ?? "(missing dataKey prop)"}"`}
      </TableEmptyState>
    )
  }

  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted">
          <tr>
            {columns.map((col) => (
              <Th key={col.key} align={col.align}>
                {col.label}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <Td key={col.key} align={col.align}>
                  {isPrimitive(row[col.key]) ? String(row[col.key]) : "—"}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
