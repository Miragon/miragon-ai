import type { ReactNode } from "react"
import {
  ListTable,
  NamedId,
  TableEmptyState,
  Td,
  countTone,
  formatNumber,
  type ListTableColumn,
} from "@miragon-ai/widget-shell/widgets"
import { CountPill, TONE_DOT, cn, type ToneVariant } from "@miragon/mcp-toolkit-ui"
import { useT } from "../messages/use-t.js"

/**
 * Row model of the canonical process-definitions table — a superset both
 * definition lists map onto. The cockpit's per-definition stats carry `counts`
 * (running / failed jobs / incidents); the standalone process list instead
 * carries `suspended`/`versionTag`. Optional fields simply don't render when
 * the source data doesn't provide them.
 */
export interface ProcessDefinitionsTableRow {
  id: string
  key: string
  name: string | null
  version: number
  /** Row status dot: severity tone in the cockpit, active/suspended standalone. */
  tone: ToneVariant
  /** Deployment version tag, rendered as a second chip next to the version. */
  versionTag?: string | null
  /** Suspension flag (standalone list) — for the optional status column. */
  suspended?: boolean
  /** Operational counts (cockpit data); the count columns render only when present. */
  counts?: { instances: number; failedJobs: number; totalIncidents: number }
}

/**
 * THE process-definitions table — the single visual language for a list of
 * process definitions. Presentational core shared by the cockpit definitions
 * table (count columns + drill actions) and the standalone process-list widget
 * (count-less, with a status column instead): same header/row primitives, same
 * name/key/version cells; the optional columns are simply absent when their
 * data (or renderer) isn't provided.
 */
export function ProcessDefinitionsTableView({
  rows,
  ariaLabel,
  emptyText,
  status,
  renderActions,
}: {
  rows: ProcessDefinitionsTableRow[]
  ariaLabel: string
  emptyText: string
  /** Optional status column (e.g. Active/Suspended in the standalone list). */
  status?: { header: string; render: (row: ProcessDefinitionsTableRow) => ReactNode }
  /** Optional per-row action cell (drill buttons, Ask-AI). Omit to drop the column. */
  renderActions?: (row: ProcessDefinitionsTableRow) => ReactNode
}) {
  const t = useT()

  if (rows.length === 0) {
    return <TableEmptyState>{emptyText}</TableEmptyState>
  }

  const showCounts = rows.some((row) => row.counts !== undefined)

  const columns: ListTableColumn[] = [
    { label: t("cockpitDefs.colProcess") },
    // Count rows are one per KEY (every version summed): their chip is the
    // key's latest version, not the version the counts belong to — the
    // column a reader can do without in an inline frame, where the counts
    // and the actions need the room (#322 U2).
    showCounts
      ? { label: t("cockpitDefs.colLatestVersion"), hideBelow: "md" }
      : { label: t("cockpitDefs.colVersion") },
    ...(status ? [{ label: status.header }] : []),
    ...(showCounts
      ? ([
          { label: t("cockpitDefs.colRunning"), align: "right" },
          { label: t("cockpitDefs.colFailedJobs"), align: "right" },
          { label: t("cockpitDefs.colIncidents"), align: "right" },
        ] satisfies ListTableColumn[])
      : []),
    ...(renderActions ? [{ plain: true, sticky: true }] : []),
  ]

  return (
    <ListTable ariaLabel={ariaLabel} columns={columns}>
      {rows.map((row) => (
        <tr key={row.id} className="hover:bg-muted transition-colors">
          <Td>
            {/* Name first, the key a quiet mono line (#322 U13). */}
            <NamedId
              name={row.name}
              id={row.key}
              lead={
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[row.tone])}
                />
              }
            />
          </Td>
          <Td>
            <span className="border-border bg-muted text-muted-foreground text-small inline-block rounded border px-1.5 py-0.5 font-mono">
              v{row.version}
            </span>
            {row.versionTag && (
              <span className="border-border bg-muted text-muted-foreground text-small ml-1.5 inline-block rounded border px-1.5 py-0.5 font-mono">
                {row.versionTag}
              </span>
            )}
          </Td>
          {status && <Td>{status.render(row)}</Td>}
          {showCounts && (
            <>
              {/* A count without a state is a plain number; jobs without
                  retries and open incidents take the one severity ladder
                  (#322 U14) — danger while there are any, else neutral. */}
              <Td align="right" className="text-foreground tabular-nums">
                {formatNumber(row.counts?.instances ?? 0)}
              </Td>
              <Td align="right">
                <CountPill tone={countTone(row.counts?.failedJobs)}>
                  {formatNumber(row.counts?.failedJobs ?? 0)}
                </CountPill>
              </Td>
              <Td align="right">
                <CountPill tone={countTone(row.counts?.totalIncidents)}>
                  {formatNumber(row.counts?.totalIncidents ?? 0)}
                </CountPill>
              </Td>
            </>
          )}
          {renderActions && (
            <Td>
              <div className="flex items-center justify-end gap-1.5">{renderActions(row)}</div>
            </Td>
          )}
        </tr>
      ))}
    </ListTable>
  )
}
