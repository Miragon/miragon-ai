import type { ReactNode } from "react"
import {
  CountPill,
  TONE_DOT,
  TableEmptyState,
  Td,
  Th,
  type ToneVariant,
} from "@miragon-ai/widget-shell/widgets"
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

  return (
    <table className="w-full border-collapse text-sm" aria-label={ariaLabel}>
      <thead className="bg-muted">
        <tr>
          <Th>{t("cockpitDefs.colProcess")}</Th>
          <Th>{t("cockpitDefs.colVersion")}</Th>
          {status && <Th>{status.header}</Th>}
          {showCounts && (
            <>
              <Th align="right">{t("cockpitDefs.colRunning")}</Th>
              <Th align="right">{t("cockpitDefs.colFailedJobs")}</Th>
              <Th align="right">{t("cockpitDefs.colIncidents")}</Th>
            </>
          )}
          {renderActions && <Th plain />}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="hover:bg-muted transition-colors">
            <Td>
              <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
                <span className={`size-1.5 rounded-full ${TONE_DOT[row.tone]}`} />
                <span className="truncate">{row.name ?? row.key}</span>
              </div>
              <div className="text-muted-foreground mt-0.5 font-mono text-xs">{row.key}</div>
            </Td>
            <Td>
              <span className="border-border bg-muted text-muted-foreground inline-block rounded border px-1.5 py-0.5 font-mono text-xs">
                v{row.version}
              </span>
              {row.versionTag && (
                <span className="border-border bg-muted text-muted-foreground ml-1.5 inline-block rounded border px-1.5 py-0.5 font-mono text-xs">
                  {row.versionTag}
                </span>
              )}
            </Td>
            {status && <Td>{status.render(row)}</Td>}
            {showCounts && (
              <>
                <Td align="right" className="text-muted-foreground font-mono text-xs tabular-nums">
                  {(row.counts?.instances ?? 0).toLocaleString()}
                </Td>
                <Td align="right">
                  {row.counts && row.counts.failedJobs > 0 ? (
                    <CountPill tone="warning">{row.counts.failedJobs}</CountPill>
                  ) : (
                    <span className="text-muted-foreground font-mono text-xs">0</span>
                  )}
                </Td>
                <Td align="right">
                  <CountPill tone={(row.counts?.totalIncidents ?? 0) > 0 ? "critical" : "success"}>
                    {row.counts?.totalIncidents ?? 0}
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
      </tbody>
    </table>
  )
}
